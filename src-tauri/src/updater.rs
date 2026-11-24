//! Automatic updates from GitHub Releases.
//!
//! New versions download silently. They install right away when the window is
//! hidden, otherwise on the next close or when the user clicks "Redémarrer".

use crate::state::AppState;
use serde::Serialize;
use std::{
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(10);
const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);
pub const RESTORE_HIDDEN_KEY: &str = "restore-hidden";

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub phase: String,
    pub current: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub progress: f64,
    pub error: Option<String>,
}

pub struct Updater {
    info: Mutex<UpdateInfo>,
    pending: Mutex<Option<(Update, Vec<u8>)>>,
    busy: AtomicBool,
}

impl Updater {
    pub fn new(current: String) -> Self {
        Self {
            info: Mutex::new(UpdateInfo {
                phase: "idle".into(),
                current,
                version: None,
                notes: None,
                progress: 0.0,
                error: None,
            }),
            pending: Mutex::new(None),
            busy: AtomicBool::new(false),
        }
    }

    fn snapshot(&self) -> Option<UpdateInfo> {
        self.info.lock().ok().map(|i| i.clone())
    }

    fn has_pending(&self) -> bool {
        self.pending.lock().map(|p| p.is_some()).unwrap_or(false)
    }
}

fn publish(app: &AppHandle, change: impl FnOnce(&mut UpdateInfo)) {
    let updater = app.state::<Updater>();
    let info = {
        let Ok(mut info) = updater.info.lock() else { return };
        change(&mut info);
        info.clone()
    };
    let _ = app.emit("pulse-update", info);
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(&app).await;
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

async fn check(app: &AppHandle) {
    if cfg!(debug_assertions) {
        publish(app, |i| i.phase = "dev".into());
        return;
    }
    let updater = app.state::<Updater>();
    if updater.has_pending() || updater.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let result = download_latest(app).await;
    updater.busy.store(false, Ordering::SeqCst);
    match result {
        Ok(true) => {
            publish(app, |i| {
                i.phase = "ready".into();
                i.progress = 1.0;
            });
            install_if_hidden(app);
        }
        Ok(false) => publish(app, |i| {
            i.phase = "uptodate".into();
            i.error = None;
        }),
        Err(error) => publish(app, |i| {
            i.phase = "error".into();
            i.error = Some(error);
        }),
    }
}

async fn download_latest(app: &AppHandle) -> Result<bool, String> {
    publish(app, |i| {
        i.phase = "checking".into();
        i.error = None;
    });
    let client = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = client.check().await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };
    let (version, notes) = (update.version.clone(), update.body.clone());
    publish(app, |i| {
        i.phase = "downloading".into();
        i.version = Some(version);
        i.notes = notes;
        i.progress = 0.0;
    });

    let handle = app.clone();
    let mut received = 0u64;
    let mut last_emit = Instant::now();
    let bytes = update
        .download(
            move |chunk, total| {
                received += chunk as u64;
                if last_emit.elapsed() >= Duration::from_millis(200) {
                    last_emit = Instant::now();
                    let progress = total.map_or(-1.0, |t| received as f64 / t.max(1) as f64);
                    publish(&handle, |i| i.progress = progress);
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(mut pending) = app.state::<Updater>().pending.lock() {
        *pending = Some((update, bytes));
    }
    Ok(true)
}

/// Installs a downloaded update. On Windows the installer closes and relaunches the app.
pub fn install(app: &AppHandle, restore_hidden: bool) -> bool {
    let updater = app.state::<Updater>();
    let Some((update, bytes)) = updater.pending.lock().ok().and_then(|mut p| p.take()) else {
        return false;
    };
    if restore_hidden {
        app.state::<AppState>().cache.set(RESTORE_HIDDEN_KEY, "1");
    }
    publish(app, |i| i.phase = "installing".into());
    if let Err(error) = update.install(&bytes) {
        app.state::<AppState>().cache.remove(RESTORE_HIDDEN_KEY);
        if let Ok(mut pending) = updater.pending.lock() {
            *pending = Some((update, bytes));
        }
        publish(app, |i| {
            i.phase = "error".into();
            i.error = Some(error.to_string());
        });
        return false;
    }
    true
}

/// Never interrupts someone using the app: installs only when the window is hidden.
pub fn install_if_hidden(app: &AppHandle) {
    let hidden = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .is_none_or(|visible| !visible);
    if hidden {
        install(app, true);
    }
}

#[tauri::command]
pub fn update_status(updater: State<'_, Updater>) -> Option<UpdateInfo> {
    updater.snapshot()
}

#[tauri::command]
pub async fn update_check(app: AppHandle) {
    check(&app).await;
}

#[tauri::command]
pub fn update_install(app: AppHandle) -> bool {
    install(&app, false)
}
