use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, Runtime};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // ── Application menu ──────────────────────────────────────────
            let file_new = MenuItem::with_id(app, "file-new-project", "New Project", true, Some("CmdOrCtrl+N"))?;
            let file_open = MenuItem::with_id(app, "file-open", "Open File…", true, Some("CmdOrCtrl+O"))?;
            let file_export = MenuItem::with_id(app, "file-export-usfm", "Export USFM…", true, Some("CmdOrCtrl+E"))?;
            let file_quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

            let file_menu = Submenu::with_id_and_items(
                app,
                "file",
                "File",
                true,
                &[
                    &file_new,
                    &file_open,
                    &PredefinedMenuItem::separator(app)?,
                    &file_export,
                    &PredefinedMenuItem::separator(app)?,
                    &file_quit,
                ],
            )?;

            let edit_menu = Submenu::with_id_and_items(
                app,
                "edit",
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("Undo"))?,
                    &PredefinedMenuItem::redo(app, Some("Redo"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("Cut"))?,
                    &PredefinedMenuItem::copy(app, Some("Copy"))?,
                    &PredefinedMenuItem::paste(app, Some("Paste"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                ],
            )?;

            let view_reference = MenuItem::with_id(app, "view-reference-panel", "Toggle Reference Panel", true, Some("CmdOrCtrl+Shift+R"))?;
            let view_source = MenuItem::with_id(app, "view-usfm-source", "Toggle USFM Source", true, Some("CmdOrCtrl+Shift+U"))?;
            let view_cache = MenuItem::with_id(app, "view-source-cache", "Offline Source Cache", true, None::<&str>)?;

            let view_menu = Submenu::with_id_and_items(
                app,
                "view",
                "View",
                true,
                &[
                    &view_reference,
                    &view_source,
                    &PredefinedMenuItem::separator(app)?,
                    &view_cache,
                ],
            )?;

            let help_shortcuts = MenuItem::with_id(app, "help-shortcuts", "Help & Shortcuts", true, Some("F1"))?;
            let help_docs = MenuItem::with_id(app, "help-docs", "Online Documentation", true, None::<&str>)?;

            let help_menu = Submenu::with_id_and_items(
                app,
                "help",
                "Help",
                true,
                &[
                    &help_shortcuts,
                    &help_docs,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::about(app, Some("About USFM Editor"), None)?,
                ],
            )?;

            let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])?;
            app.set_menu(menu)?;

            // Forward menu events to the WebView as Tauri events.
            app.on_menu_event(|app, event| {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("menu-event", event.id().0.clone());
                }
            });

            // ── System tray ───────────────────────────────────────────────
            let tray_show = MenuItem::with_id(app, "tray-show", "Show Window", true, None::<&str>)?;
            let tray_quit = PredefinedMenuItem::quit(app, Some("Quit USFM Editor"))?;
            let tray_menu = Menu::with_items(app, &[&tray_show, &PredefinedMenuItem::separator(app)?, &tray_quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&tray_menu)
                .tooltip("USFM Editor")
                .on_menu_event(|app, event| {
                    if event.id().0 == "tray-show" {
                        show_main_window(app);
                    }
                })
                .on_tray_icon_event(|_tray, event| {
                    // Left-click on the tray icon shows the window.
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = _tray.app_handle();
                        show_main_window(app);
                    }
                })
                .build(app)?;

            // Open DevTools in development builds.
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.unminimize();
    }
}
