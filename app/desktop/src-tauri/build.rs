fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_update_status",
            "desktop_install_update",
            "desktop_open_repository",
        ]),
    ))
    .expect("Failed to build desktop permissions")
}
