mod admin;
mod auth;
mod cache;
mod config;
mod error;
mod markdown;
mod models;
mod pb;
mod state;
mod sync;
mod updater;

use cache::Cache;
use error::{Error, Result};
use models::{AppInfo, Prefs, Snapshot};
use pb::Pb;
use state::AppState;
use std::{
    sync::{
        RwLock,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{
    AppHandle, Manager, State, WindowEvent,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{Mutex as AsyncMutex, Notify};

const PREFS_KEY: &str = "prefs";
const HIDDEN_ARG: &str = "--hidden";

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit(app: &AppHandle) {
    // A downloaded update is applied on the way out.
    if !updater::install(app, false) {
        app.exit(0);
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Nexora Pulse", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &separator, &exit])?;
    let mut tray = TrayIconBuilder::with_id("pulse")
        .tooltip("Nexora Pulse")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[tauri::command]
fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        mica: state.mica.load(Ordering::SeqCst),
        server: state.pb.base.clone(),
        secure: state.pb.base.starts_with("https://"),
    }
}

/// Called by the interface after its first paint, so the window never flashes empty.
#[tauri::command]
fn window_ready(app: AppHandle, state: State<'_, AppState>) {
    if !state.shown.swap(true, Ordering::SeqCst) && !state.start_hidden.load(Ordering::SeqCst) {
        show_main(&app);
    }
}

#[tauri::command]
fn open_link(app: AppHandle, url: String) -> Result<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(Error::msg("Lien non autorisé."));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
fn get_prefs(app: AppHandle, state: State<'_, AppState>) -> Prefs {
    let mut prefs = state.current_prefs();
    prefs.autostart = app.autolaunch().is_enabled().unwrap_or(false);
    prefs
}

#[tauri::command]
fn set_prefs(app: AppHandle, state: State<'_, AppState>, prefs: Prefs) -> Result<Prefs> {
    let autolaunch = app.autolaunch();
    let enabled = autolaunch.is_enabled().unwrap_or(false);
    if prefs.autostart != enabled {
        let change = if prefs.autostart { autolaunch.enable() } else { autolaunch.disable() };
        change.map_err(|e| Error::msg(format!("Démarrage automatique : {e}")))?;
    }
    state.cache.set_json(PREFS_KEY, &prefs);
    if let Ok(mut slot) = state.prefs.write() {
        *slot = prefs.clone();
    }
    Ok(prefs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let hidden_arg = std::env::args().any(|a| a == HIDDEN_ARG);

    tauri::Builder::default()
        // Must stay first: a second launch only brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .setup(move |app| {
            let handle = app.handle().clone();
            let dir = match config::dev_data_dir() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let cache = Cache::open(&dir.join("pulse.db"))?;
            let restore_hidden = cache.get(updater::RESTORE_HIDDEN_KEY).is_some();
            cache.remove(updater::RESTORE_HIDDEN_KEY);
            let prefs: Prefs = cache.get_json(PREFS_KEY).unwrap_or_default();

            let state = AppState {
                pb: Pb::new(&config::pulse_server()),
                store: Pb::new(config::STORE_SERVER),
                cache,
                session: RwLock::new(None),
                snapshot: RwLock::new(Snapshot::default()),
                prefs: RwLock::new(prefs),
                wake: Notify::new(),
                sync_lock: AsyncMutex::new(()),
                live: AtomicBool::new(false),
                mica: AtomicBool::new(false),
                start_hidden: AtomicBool::new(hidden_arg || restore_hidden),
                shown: AtomicBool::new(false),
            };
            sync::load_cached(&state);

            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                let mica = window_vibrancy::apply_mica(&window, None).is_ok();
                state.mica.store(mica, Ordering::SeqCst);
            }

            app.manage(state);
            app.manage(updater::Updater::new(app.package_info().version.to_string()));
            build_tray(&handle)?;
            sync::spawn_sync(handle.clone());
            sync::spawn_realtime(handle.clone());
            updater::spawn(handle.clone());

            // Safety net in case the interface never reports its first paint.
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(4)).await;
                let state = handle.state::<AppState>();
                if !state.shown.swap(true, Ordering::SeqCst)
                    && !state.start_hidden.load(Ordering::SeqCst)
                {
                    show_main(&handle);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                if app.state::<AppState>().current_prefs().close_to_tray {
                    let _ = window.hide();
                    updater::install_if_hidden(app);
                } else {
                    quit(app);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            window_ready,
            open_link,
            get_prefs,
            set_prefs,
            sync::snapshot,
            sync::refresh_now,
            auth::session,
            auth::login,
            auth::logout,
            admin::save_post,
            admin::save_release,
            admin::save_app,
            admin::import_store_apps,
            admin::open_incident,
            admin::update_incident,
            admin::delete_record,
            admin::delete_app,
            admin::render_markdown,
            updater::update_status,
            updater::update_check,
            updater::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nexora Pulse");
}
