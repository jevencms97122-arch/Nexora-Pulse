//! Server addresses. Moving PocketBase to HTTPS only requires changing these two
//! values and the matching `img-src` entries of the CSP in `tauri.conf.json`.

/// PocketBase instance holding the Pulse content.
pub const PULSE_SERVER: &str = "http://92.49.99.59:8097";

/// PocketBase instance of Nexora Store, read-only: app versions and icons.
pub const STORE_SERVER: &str = "http://92.49.99.59:8096";

/// Pulse server. Debug builds can target a disposable local instance.
pub fn pulse_server() -> String {
    dev_override("PULSE_DEV_SERVER").unwrap_or_else(|| PULSE_SERVER.to_string())
}

/// Debug builds can keep their test data out of the real app folder.
pub fn dev_data_dir() -> Option<std::path::PathBuf> {
    dev_override("PULSE_DEV_DATA").map(Into::into)
}

fn dev_override(name: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(name).ok().filter(|v| !v.is_empty())
    } else {
        None
    }
}

pub const TOPICS: [&str; 5] = [
    "pulse_apps/*",
    "pulse_posts/*",
    "pulse_releases/*",
    "pulse_incidents/*",
    "pulse_incident_updates/*",
];
