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
    available_version: Mutex<Option<String>>,
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

fn check_update(app: tauri::AppHandle, interactive: bool) {
    let state = app.state::<Runtime>();
    if state.updating.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = update(&app, interactive).await;
        app.state::<Runtime>()
            .updating
            .store(false, Ordering::SeqCst);
        if let Err(error) = result {
            if interactive {
                message(&app, format!("Update failed: {error}"));
            }
        }
    });
}

fn verify_desktop_caller(window: &tauri::WebviewWindow) -> Result<(), String> {
    let state = window.state::<Runtime>();
    let backend = state.backend.lock().map_err(|e| e.to_string())?;
    let backend = backend.as_ref().ok_or("Server is not ready")?;
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() != "main" || url.origin() != backend.origin.origin() {
        return Err("Desktop actions are only available to the connected desktop viewer".into());
    }
    Ok(())
}

#[tauri::command]
fn desktop_update_status(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    verify_desktop_caller(&window)?;
    let state = window.state::<Runtime>();
    let version = state
        .available_version
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    Ok(serde_json::json!({
        "currentVersion": window.app_handle().package_info().version.to_string(),
        "version": version,
        "busy": state.updating.load(Ordering::SeqCst)
    }))
}

#[tauri::command]
async fn desktop_check_update(window: tauri::WebviewWindow) -> Result<(), String> {
    verify_desktop_caller(&window)?;
    let app = window.app_handle().clone();
    if option_env!("REDPACT_UPDATE_ENDPOINT").is_none()
        || option_env!("REDPACT_UPDATE_PUBLIC_KEY").is_none()
    {
        return Err("Updates are not configured for this development build.".into());
    }
    let state = app.state::<Runtime>();
    if state.updating.swap(true, Ordering::SeqCst) {
        return Err("An update operation is already running.".into());
    }
    let result = update(&app, false).await;
    state.updating.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
fn desktop_install_update(window: tauri::WebviewWindow) -> Result<(), String> {
    verify_desktop_caller(&window)?;
    check_update(window.app_handle().clone(), true);
    Ok(())
}

#[tauri::command]
async fn desktop_open_repository(window: tauri::WebviewWindow) -> Result<(), String> {
    verify_desktop_caller(&window)?;
    // Only this fixed public repository can leave the viewer through this command.
    let url = "https://github.com/wo658/redpact";
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("/usr/bin/open");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    let result = command.arg(url).status().map_err(|e| e.to_string())?;
    if !result.success() {
        return Err("Could not open the public repository in your browser".into());
    }
    Ok(())
}

async fn update(app: &tauri::AppHandle, interactive: bool) -> Result<(), String> {
    let endpoint = option_env!("REDPACT_UPDATE_ENDPOINT");
    let key = option_env!("REDPACT_UPDATE_PUBLIC_KEY");
    let (Some(endpoint), Some(key)) = (endpoint, key) else {
        if interactive {
            message(
                app,
                "Updates are not configured for this development build.",
            );
        }
        return Ok(());
    };
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    if url.scheme() != "https" {
        return Err("Update endpoint must use HTTPS".into());
    }
    let builder = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?;
    let builder = if interactive {
        builder
    } else {
        builder.timeout(std::time::Duration::from_secs(30))
    };
    let updater = builder.build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        *app.state::<Runtime>()
            .available_version
            .lock()
            .map_err(|e| e.to_string())? = None;
        if interactive {
            message(app, "Redpact is up to date.");
        }
        return Ok(());
    };
    *app.state::<Runtime>()
        .available_version
        .lock()
        .map_err(|e| e.to_string())? = Some(update.version.clone());
    if !interactive {
        return Ok(());
    }
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
        .invoke_handler(tauri::generate_handler![desktop_update_status, desktop_check_update, desktop_install_update, desktop_open_repository])
        .manage(Runtime {
            backend: Mutex::new(None),
            exiting: AtomicBool::new(false),
            exit_allowed: AtomicBool::new(false),
            updating: AtomicBool::new(false),
            available_version: Mutex::new(None),
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Redpact", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Redpact", true, Some("CmdOrCtrl+Q"))?;
            let product = Submenu::with_items(
                app,
                "Redpact",
                true,
                &[&show, &PredefinedMenuItem::separator(app)?, &quit],
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
            app.add_capability(serde_json::json!({
                "identifier": "main-updates",
                "windows": ["main"],
                "local": false,
                "remote": { "urls": [origin.as_str()] },
                "permissions": ["allow-desktop-update-status", "allow-desktop-check-update", "allow-desktop-install-update", "allow-desktop-open-repository"]
            }).to_string())?;
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            app.add_capability(serde_json::json!({
                "identifier": "main-titlebar",
                "windows": ["main"],
                "local": false,
                "remote": { "urls": [origin.as_str()] },
                "permissions": ["core:window:allow-start-dragging", "core:window:allow-internal-toggle-maximize"]
            }).to_string())?;
            #[cfg(target_os = "windows")]
            app.add_capability(serde_json::json!({
                "identifier": "main-window-controls",
                "windows": ["main"],
                "local": false,
                "remote": { "urls": [origin.as_str()] },
                "permissions": ["core:window:allow-minimize", "core:window:allow-toggle-maximize", "core:window:allow-is-maximized", "core:window:allow-close"]
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
            #[cfg(target_os = "windows")]
            let builder = builder
                .decorations(false)
                .shadow(true)
                .initialization_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.desktop = 'windows'; });");
            let window = builder.build()?;
            #[cfg(target_os = "windows")]
            window.hide_menu()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                check_update(handle.clone(), false);
                std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
            });
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
