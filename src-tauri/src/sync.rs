use crate::{
    config::{STORE_SERVER, TOPICS},
    error::{Error, Result},
    markdown,
    models::{App, Incident, IncidentUpdate, Post, Release, Snapshot, StoreApp, now, public_view},
    state::AppState,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use std::{collections::HashMap, sync::atomic::Ordering, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

const SNAPSHOT_KEY: &str = "snapshot";
const CATALOG_KEY: &str = "store-catalog";
const SEEDED_KEY: &str = "notifications-seeded";
const MAX_TOASTS: usize = 3;

/// Loads everything visible to the current user from the server.
async fn fetch(state: &AppState) -> Result<Snapshot> {
    let token = state.token();
    let t = token.as_deref();
    let (mut apps, mut posts, mut releases, mut incidents, updates) = tokio::try_join!(
        state.pb.list_all::<App>("pulse_apps", "sort,name", t),
        state.pb.list_all::<Post>("pulse_posts", "-publish_at", t),
        state.pb.list_all::<Release>("pulse_releases", "-released_at", t),
        state.pb.list_all::<Incident>("pulse_incidents", "-started_at", t),
        state.pb.list_all::<IncidentUpdate>("pulse_incident_updates", "created", t),
    )?;

    let catalog = store_catalog(state).await;
    for app in &mut apps {
        if let Some(entry) = catalog.iter().find(|c| c.id == app.store_id) {
            app.version = entry.version.clone();
            app.icon_url = entry.icon_url.clone();
        }
    }
    for post in &mut posts {
        post.html = markdown::to_html(&post.body);
        if !post.cover.is_empty() {
            post.cover_url = state.pb.file_url("pulse_posts", &post.id, &post.cover);
        }
    }
    for release in &mut releases {
        release.html = markdown::to_html(&release.notes);
    }
    let mut by_incident: HashMap<String, Vec<IncidentUpdate>> = HashMap::new();
    for update in updates {
        by_incident.entry(update.incident.clone()).or_default().push(update);
    }
    for incident in &mut incidents {
        incident.updates = by_incident.remove(&incident.id).unwrap_or_default();
    }

    Ok(Snapshot {
        apps,
        posts,
        releases,
        incidents,
        online: true,
        live: state.is_live(),
        setup_required: false,
        fetched_at: now(),
    })
}

/// Versions and icons from Nexora Store. Falls back on the last known catalog.
pub async fn store_catalog(state: &AppState) -> Vec<StoreApp> {
    match state.store.list_all::<StoreApp>("apps", "name", None).await {
        Ok(mut list) => {
            for app in &mut list {
                if !app.icon.is_empty() {
                    app.icon_url = format!("{STORE_SERVER}/api/files/apps/{}/{}", app.id, app.icon);
                }
            }
            state.cache.set_json(CATALOG_KEY, &list);
            list
        }
        Err(_) => state.cache.get_json(CATALOG_KEY).unwrap_or_default(),
    }
}

/// Fetches, stores and broadcasts the latest data.
pub async fn refresh(app: &AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let _guard = state.sync_lock.lock().await;
    let snapshot = match fetch(&state).await {
        Ok(snapshot) => {
            notify_new(app, &state, &snapshot);
            state.cache.set_json(SNAPSHOT_KEY, &public_view(&snapshot));
            snapshot
        }
        Err(error) => {
            let mut stale = state.current_snapshot();
            stale.live = false;
            stale.online = matches!(error, Error::NotSetup);
            stale.setup_required = matches!(error, Error::NotSetup);
            stale
        }
    };
    if let Ok(mut slot) = state.snapshot.write() {
        *slot = snapshot.clone();
    }
    let _ = app.emit("pulse-snapshot", &snapshot);
    snapshot
}

pub fn load_cached(state: &AppState) {
    if let Some(mut snapshot) = state.cache.get_json::<Snapshot>(SNAPSHOT_KEY) {
        snapshot.online = false;
        snapshot.live = false;
        if let Ok(mut slot) = state.snapshot.write() {
            *slot = snapshot;
        }
    }
}

/// Periodic refresh. The minute tick also reveals scheduled content on time.
pub fn spawn_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        crate::auth::restore(&app.state::<AppState>()).await;
        loop {
            refresh(&app).await;
            let state = app.state::<AppState>();
            tokio::select! {
                _ = state.wake.notified() => tokio::time::sleep(Duration::from_millis(300)).await,
                _ = tokio::time::sleep(Duration::from_secs(60)) => {}
            }
        }
    });
}

pub fn spawn_realtime(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .read_timeout(Duration::from_secs(360))
            .build()
            .expect("realtime client");
        let mut backoff = 1u64;
        loop {
            let connected = stream(&app, &client).await;
            set_live(&app, false);
            backoff = if connected { 1 } else { (backoff * 2).min(60) };
            tokio::time::sleep(Duration::from_secs(backoff)).await;
        }
    });
}

fn set_live(app: &AppHandle, live: bool) {
    let state = app.state::<AppState>();
    if state.live.swap(live, Ordering::SeqCst) != live {
        if let Ok(mut snapshot) = state.snapshot.write() {
            snapshot.live = live;
        }
        let _ = app.emit("pulse-live", live);
    }
}

#[derive(Deserialize)]
struct ConnectEvent {
    #[serde(rename = "clientId")]
    client_id: String,
}

/// Follows the PocketBase event stream. Returns true if it was connected at some point.
async fn stream(app: &AppHandle, client: &reqwest::Client) -> bool {
    let state = app.state::<AppState>();
    let url = format!("{}/api/realtime", state.pb.base);
    let Ok(resp) = client.get(&url).header("Accept", "text/event-stream").send().await else {
        return false;
    };
    if !resp.status().is_success() {
        return false;
    }
    let mut connected = false;
    let mut buffer = String::new();
    let mut bytes = resp.bytes_stream();
    while let Some(Ok(chunk)) = bytes.next().await {
        buffer.push_str(&String::from_utf8_lossy(&chunk).replace("\r\n", "\n"));
        for (event, data) in drain_events(&mut buffer) {
            if event == "PB_CONNECT" {
                let Ok(info) = serde_json::from_str::<ConnectEvent>(&data) else {
                    return connected;
                };
                let body = json!({ "clientId": info.client_id, "subscriptions": TOPICS });
                match client.post(&url).json(&body).send().await {
                    Ok(r) if r.status().is_success() => {
                        connected = true;
                        set_live(app, true);
                        state.wake.notify_one();
                    }
                    _ => return connected,
                }
            } else if event.starts_with("pulse_") {
                state.wake.notify_one();
            }
        }
    }
    connected
}

/// Removes complete SSE messages from the buffer and returns (event, data) pairs.
fn drain_events(buffer: &mut String) -> Vec<(String, String)> {
    let mut out = Vec::new();
    while let Some(end) = buffer.find("\n\n") {
        let message: String = buffer.drain(..end + 2).collect();
        let mut event = String::new();
        let mut data = Vec::new();
        for line in message.lines() {
            if let Some(value) = line.strip_prefix("event:") {
                event = value.trim().to_string();
            } else if let Some(value) = line.strip_prefix("data:") {
                data.push(value.trim_start().to_string());
            }
        }
        if !event.is_empty() {
            out.push((event, data.join("\n")));
        }
    }
    out
}

struct Toast {
    title: String,
    body: String,
}

fn status_label(status: &str) -> &'static str {
    match status {
        "operational" => "Opérationnel",
        "degraded" => "Performances dégradées",
        "partial_outage" => "Panne partielle",
        "major_outage" => "Panne majeure",
        "maintenance" => "Maintenance",
        _ => "Non renseigné",
    }
}

/// Sends a Windows notification for what appeared since the last sync.
fn notify_new(app: &AppHandle, state: &AppState, snapshot: &Snapshot) {
    let view = public_view(snapshot);
    let prefs = state.current_prefs();
    let seeded = state.cache.get(SEEDED_KEY).is_some();
    let muted = |ids: &[String]| !ids.is_empty() && ids.iter().all(|id| prefs.muted_apps.contains(id));
    let app_name = |id: &str| {
        view.apps
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.name.clone())
            .unwrap_or_else(|| "Nexora".to_string())
    };
    let mut toasts = Vec::new();

    for post in &view.posts {
        if state.cache.mark_seen(&format!("post:{}", post.id)) && !muted(&post.apps) {
            toasts.push(Toast { title: post.title.clone(), body: post.summary.clone() });
        }
    }
    for release in &view.releases {
        if state.cache.mark_seen(&format!("release:{}", release.id))
            && !muted(std::slice::from_ref(&release.app))
        {
            toasts.push(Toast {
                title: format!("{} {}", app_name(&release.app), release.version),
                body: if release.title.is_empty() {
                    "Nouvelle version disponible".to_string()
                } else {
                    release.title.clone()
                },
            });
        }
    }
    for incident in &view.incidents {
        if state.cache.mark_seen(&format!("incident:{}", incident.id)) && !muted(&incident.apps) {
            toasts.push(Toast {
                title: format!("Incident : {}", incident.title),
                body: incident.updates.last().map(|u| u.message.clone()).unwrap_or_default(),
            });
        }
        for update in incident.updates.iter().skip(1) {
            if state.cache.mark_seen(&format!("incident-update:{}", update.id)) && !muted(&incident.apps) {
                toasts.push(Toast { title: incident.title.clone(), body: update.message.clone() });
            }
        }
    }
    for item in &view.apps {
        let key = format!("status:{}", item.id);
        let previous = state.cache.get(&key);
        if previous.as_deref() != Some(item.status.as_str()) {
            state.cache.set(&key, &item.status);
            if previous.is_some() && !prefs.muted_apps.contains(&item.id) {
                toasts.push(Toast {
                    title: item.name.clone(),
                    body: format!("État : {}", status_label(&item.status)),
                });
            }
        }
    }

    if !seeded {
        // First sync: existing content is history, not news.
        state.cache.set(SEEDED_KEY, "1");
        return;
    }
    let focused = app
        .get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    if !prefs.notifications || focused || toasts.is_empty() {
        return;
    }
    let extra = toasts.len().saturating_sub(MAX_TOASTS);
    for toast in toasts.iter().take(MAX_TOASTS) {
        let _ = app.notification().builder().title(&toast.title).body(&toast.body).show();
    }
    if extra > 0 {
        let _ = app
            .notification()
            .builder()
            .title("Nexora Pulse")
            .body(format!("{extra} autres nouveautés à découvrir"))
            .show();
    }
}

#[tauri::command]
pub fn snapshot(state: State<'_, AppState>) -> Snapshot {
    state.current_snapshot()
}

#[tauri::command]
pub async fn refresh_now(app: AppHandle) -> Snapshot {
    refresh(&app).await
}

#[cfg(test)]
mod tests {
    use super::drain_events;

    #[test]
    fn parses_complete_events_and_keeps_partial_ones() {
        let mut buffer = "id:1\nevent:PB_CONNECT\ndata:{\"clientId\":\"a\"}\n\nevent:pulse_posts/*\nda".to_string();
        let events = drain_events(&mut buffer);
        assert_eq!(events, [("PB_CONNECT".to_string(), "{\"clientId\":\"a\"}".to_string())]);
        assert_eq!(buffer, "event:pulse_posts/*\nda");
        buffer.push_str("ta:{}\n\n");
        assert_eq!(drain_events(&mut buffer)[0].0, "pulse_posts/*");
        assert!(buffer.is_empty());
    }
}
