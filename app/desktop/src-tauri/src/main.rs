#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod backend;

use backend::Backend;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

struct Runtime {
    backend: Mutex<Option<Backend>>,
    exiting: AtomicBool,
    exit_allowed: AtomicBool,
    updating: AtomicBool,
}

fn message(app: &tauri::AppHandle, text: impl Into<String>) {
    app.dialog().message(text).title("Redpact").show(|_| {});
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn check_update(app: tauri::AppHandle) {
    let state = app.state::<Runtime>();
    if state.updating.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = update(&app).await;
        app.state::<Runtime>()
            .updating
            .store(false, Ordering::SeqCst);
        if let Err(error) = result {
            message(&app, format!("Update failed: {error}"));
        }
    });
}

async fn update(app: &tauri::AppHandle) -> Result<(), String> {
    let endpoint = option_env!("REDPACT_UPDATE_ENDPOINT");
    let key = option_env!("REDPACT_UPDATE_PUBLIC_KEY");
    let (Some(endpoint), Some(key)) = (endpoint, key) else {
        message(
            app,
            "Updates are not configured for this development build.",
        );
        return Ok(());
    };
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    if url.scheme() != "https" {
        return Err("Update endpoint must use HTTPS".into());
    }
    let updater = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        message(app, "Redpact is up to date.");
        return Ok(());
    };
    let approved = app
        .dialog()
        .message(format!(
            "Redpact {} is available. Download and restart? Active tests will defer installation.",
            update.version
        ))
        .title("Update Redpact")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();
    if !approved {
        return Ok(());
    }
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    let idle = app
        .state::<Runtime>()
        .backend
        .lock()
        .map_err(|e| e.to_string())?
        .as_mut()
        .ok_or("Server is not ready")?
        .stop(true)?;
    if !idle {
        message(
            app,
            "Finish active tests and environment operations, then check for updates again.",
        );
        return Ok(());
    }
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            message(
                app,
                format!(
                    "Installation failed: {error}. Quit and reopen Redpact to restart the server."
                ),
            );
            Err(error.to_string())
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Runtime {
            backend: Mutex::new(None),
            exiting: AtomicBool::new(false),
            exit_allowed: AtomicBool::new(false),
            updating: AtomicBool::new(false),
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Redpact", true, None::<&str>)?;
            let updates =
                MenuItem::with_id(app, "updates", "Check for Updates…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Redpact", true, Some("CmdOrCtrl+Q"))?;
            let product = Submenu::with_items(
                app,
                "Redpact",
                true,
                &[&show, &updates, &PredefinedMenuItem::separator(app)?, &quit],
            )?;
            let edit = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            app.set_menu(Menu::with_items(app, &[&product, &edit])?)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                "show" => show_window(app),
                "updates" => check_update(app.clone()),
                "quit" => app.exit(0),
                _ => {}
            });
            let resources = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../node_modules/.redpact/runtime")
            } else {
                app.path().resource_dir()?.join("runtime")
            };
            let data = std::env::var_os("REDPACT_DESKTOP_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("state"));
            let backend = Backend::start(&resources, &data).map_err(std::io::Error::other)?;
            let origin = backend.origin.clone();
            let allowed = origin.clone();
            *app.state::<Runtime>().backend.lock().unwrap() = Some(backend);
            #[cfg(target_os = "macos")]
            app.add_capability(serde_json::json!({
                "identifier": "main-titlebar",
                "windows": ["main"],
                "local": false,
                "remote": { "urls": [origin.as_str()] },
                "permissions": ["core:window:allow-start-dragging", "core:window:allow-internal-toggle-maximize"]
            }).to_string())?;
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
                .title("Redpact")
                .inner_size(1280.0, 840.0)
                .min_inner_size(800.0, 560.0)
                .on_navigation(move |url| backend::allowed_navigation(&allowed, url));
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(16.0, 24.0))
                .initialization_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.desktop = 'macos'; });");
            let window = builder.build()?;
            let hidden = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hidden.hide();
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to start Redpact desktop; inspect desktop-server.log for backend errors");
    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            let state = app.state::<Runtime>();
            if !state.exit_allowed.load(Ordering::SeqCst) {
                api.prevent_exit();
                if state.exiting.swap(true, Ordering::SeqCst) {
                    return;
                }
                let handle = app.clone();
                std::thread::spawn(move || {
                    let result = handle
                        .state::<Runtime>()
                        .backend
                        .lock()
                        .unwrap()
                        .as_mut()
                        .map(|backend| backend.stop(false))
                        .unwrap_or(Ok(true));
                    match result {
                        Ok(true) => {
                            handle
                                .state::<Runtime>()
                                .exit_allowed
                                .store(true, Ordering::SeqCst);
                            handle.exit(0);
                        }
                        _ => {
                            handle
                                .state::<Runtime>()
                                .exiting
                                .store(false, Ordering::SeqCst);
                            message(
                                &handle,
                                format!("Server cleanup has not completed: {result:?}"),
                            );
                        }
                    }
                });
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_window(app),
        _ => {}
    });
}
