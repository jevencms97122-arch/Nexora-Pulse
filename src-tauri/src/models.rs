use serde::{Deserialize, Serialize};

pub const STATUSES: [&str; 6] = [
    "unknown",
    "operational",
    "degraded",
    "partial_outage",
    "major_outage",
    "maintenance",
];
pub const POST_KINDS: [&str; 4] = ["announcement", "news", "event", "maintenance"];
pub const PUBLISH_STATES: [&str; 2] = ["draft", "published"];
pub const CHANNELS: [&str; 2] = ["stable", "beta"];
pub const CHECK_KINDS: [&str; 3] = ["none", "http", "tcp"];
pub const SEVERITIES: [&str; 3] = ["minor", "major", "critical"];
pub const PHASES: [&str; 4] = ["investigating", "identified", "monitoring", "resolved"];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct App {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub tagline: String,
    pub accent: String,
    pub store_id: String,
    pub status: String,
    pub status_message: String,
    pub sort: i64,
    pub visible: bool,
    pub updated: String,
    // Automatic monitoring, written by pulse-monitor.
    pub check_kind: String,
    pub check_target: String,
    pub check_ok: bool,
    pub check_latency: i64,
    pub checked_at: String,
    // Filled from the Nexora Store catalog.
    pub version: String,
    pub icon_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Post {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub kind: String,
    pub apps: Vec<String>,
    pub pinned: bool,
    pub state: String,
    pub publish_at: String,
    pub cover: String,
    pub created: String,
    pub updated: String,
    // Computed by Rust.
    pub html: String,
    pub cover_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Release {
    pub id: String,
    pub app: String,
    pub version: String,
    pub title: String,
    pub notes: String,
    pub channel: String,
    pub state: String,
    pub released_at: String,
    pub created: String,
    pub updated: String,
    pub html: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct IncidentUpdate {
    pub id: String,
    pub incident: String,
    pub phase: String,
    pub message: String,
    pub created: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Incident {
    pub id: String,
    pub title: String,
    pub severity: String,
    pub phase: String,
    pub apps: Vec<String>,
    pub started_at: String,
    pub resolved_at: String,
    pub created: String,
    pub updated: String,
    pub updates: Vec<IncidentUpdate>,
}

/// Checks counted for one app on one UTC day.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct UptimeDay {
    pub app: String,
    pub day: String,
    pub ok: f64,
    pub total: f64,
    pub latency_sum: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Snapshot {
    pub apps: Vec<App>,
    pub uptime: Vec<UptimeDay>,
    pub posts: Vec<Post>,
    pub releases: Vec<Release>,
    pub incidents: Vec<Incident>,
    pub online: bool,
    pub live: bool,
    pub setup_required: bool,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct StoreApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub icon: String,
    pub icon_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Editor {
    pub id: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    pub notifications: bool,
    pub muted_apps: Vec<String>,
    pub close_to_tray: bool,
    pub autostart: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            notifications: true,
            muted_apps: Vec::new(),
            close_to_tray: true,
            autostart: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub mica: bool,
    pub server: String,
    pub secure: bool,
}

/// Current time in PocketBase's sortable date format.
pub fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3fZ").to_string()
}

/// Accepts ISO dates from the interface and returns PocketBase's format.
pub fn normalize_date(value: &str) -> String {
    value.trim().replacen('T', " ", 1)
}

/// What an anonymous visitor may see right now. Drafts and scheduled content are removed.
pub fn public_view(snapshot: &Snapshot) -> Snapshot {
    let at = now();
    let mut out = snapshot.clone();
    out.apps.retain(|a| a.visible);
    let visible: Vec<String> = out.apps.iter().map(|a| a.id.clone()).collect();
    out.uptime.retain(|u| visible.contains(&u.app));
    out.posts
        .retain(|p| p.state == "published" && !p.publish_at.is_empty() && p.publish_at <= at);
    // A hidden app disappears with everything that mentions it.
    out.releases.retain(|r| {
        r.state == "published"
            && !r.released_at.is_empty()
            && r.released_at <= at
            && visible.contains(&r.app)
    });
    for post in &mut out.posts {
        post.apps.retain(|id| visible.contains(id));
    }
    out.incidents
        .retain(|i| i.apps.is_empty() || i.apps.iter().any(|id| visible.contains(id)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_view_hides_drafts_and_scheduled_content() {
        let post = |id: &str, state: &str, at: &str| Post {
            id: id.into(),
            state: state.into(),
            publish_at: at.into(),
            ..Default::default()
        };
        let snapshot = Snapshot {
            posts: vec![
                post("live", "published", "2020-01-01 00:00:00.000Z"),
                post("draft", "draft", "2020-01-01 00:00:00.000Z"),
                post("later", "published", "2999-01-01 00:00:00.000Z"),
                post("undated", "published", ""),
            ],
            ..Default::default()
        };
        let ids: Vec<_> = public_view(&snapshot).posts.into_iter().map(|p| p.id).collect();
        assert_eq!(ids, ["live"]);
    }

    #[test]
    fn dates_are_normalized() {
        assert_eq!(
            normalize_date(" 2026-11-23T10:00:00.000Z "),
            "2026-11-23 10:00:00.000Z"
        );
    }
}
