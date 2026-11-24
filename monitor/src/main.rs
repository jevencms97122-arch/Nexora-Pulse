//! pulse-monitor: checks the Nexora services on a schedule and records the results
//! in PocketBase, so Nexora Pulse can show a measured uptime.
//!
//! Configuration (environment variables):
//!   PULSE_EMAIL, PULSE_PASSWORD  a `pulse_editors` account, ideally one just for the monitor
//!   PULSE_URL                    PocketBase address (default http://92.49.99.59:8097)
//!   PULSE_INTERVAL_SECS          seconds between two checks (default 60, minimum 15)

use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env,
    time::{Duration, Instant},
};
use tokio::{net::TcpStream, time::timeout};

const DEFAULT_URL: &str = "http://92.49.99.59:8097";
const AUTO_MESSAGE: &str = "Injoignable (détecté automatiquement)";
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
/// Failures in a row before an app is declared down: avoids flapping on one lost packet.
const FAILS_TO_DECLARE_DOWN: u32 = 2;
/// The app record is rewritten at most this often when nothing changed.
const REFRESH_EVERY: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct AppRecord {
    id: String,
    name: String,
    check_kind: String,
    check_target: String,
    check_ok: bool,
    status: String,
    status_message: String,
}

#[derive(Deserialize)]
struct List {
    items: Vec<AppRecord>,
}

#[derive(Deserialize)]
struct IdOnly {
    id: String,
}

#[derive(Deserialize)]
struct Found {
    items: Vec<IdOnly>,
}

#[derive(Deserialize)]
struct Auth {
    token: String,
}

#[derive(Default)]
struct Track {
    fails: u32,
    written: Option<Instant>,
}

struct Monitor {
    http: reqwest::Client,
    base: String,
    email: String,
    password: String,
    token: Option<String>,
    tracks: HashMap<String, Track>,
    /// (app id, day) -> id of the day's uptime record.
    day_records: HashMap<(String, String), String>,
}

/// Is the target well-formed for its kind?
fn valid_target(kind: &str, target: &str) -> bool {
    match kind {
        "http" => target.starts_with("http://") || target.starts_with("https://"),
        "tcp" => target
            .rsplit_once(':')
            .is_some_and(|(host, port)| !host.is_empty() && port.parse::<u16>().is_ok()),
        _ => false,
    }
}

/// New (status, message) for an app, or None when it must stay as it is.
/// Only automatic states are touched: a manual maintenance or degradation is never overwritten.
fn decide_status(status: &str, message: &str, ok: bool, fails: u32) -> Option<(&'static str, &'static str)> {
    if !ok && fails >= FAILS_TO_DECLARE_DOWN && matches!(status, "" | "unknown" | "operational") {
        return Some(("major_outage", AUTO_MESSAGE));
    }
    if ok && (matches!(status, "" | "unknown") || (status == "major_outage" && message == AUTO_MESSAGE)) {
        return Some(("operational", ""));
    }
    None
}

fn now_pb() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S%.3fZ").to_string()
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn log(message: &str) {
    println!("[{}] {message}", Utc::now().format("%Y-%m-%d %H:%M:%S"));
}

/// Checks one service. Returns (reachable, latency in ms).
async fn probe(client: &reqwest::Client, kind: &str, target: &str) -> (bool, u64) {
    let started = Instant::now();
    let ok = match kind {
        "http" => client
            .get(target)
            .send()
            .await
            .is_ok_and(|r| r.status().as_u16() < 500),
        "tcp" => matches!(timeout(PROBE_TIMEOUT, TcpStream::connect(target)).await, Ok(Ok(_))),
        _ => false,
    };
    (ok, started.elapsed().as_millis() as u64)
}

enum Outcome {
    Done(Value),
    Unauthorized,
    Offline,
    Failed(u16),
}

impl Monitor {
    fn url(&self, path: &str) -> String {
        format!("{}/api/{path}", self.base)
    }

    async fn login(&mut self) -> bool {
        let body = json!({ "identity": self.email, "password": self.password });
        let url = self.url("collections/pulse_editors/auth-with-password");
        match self.http.post(url).json(&body).send().await {
            Ok(r) if r.status().is_success() => match r.json::<Auth>().await {
                Ok(auth) => {
                    self.token = Some(auth.token);
                    true
                }
                Err(_) => false,
            },
            Ok(r) => {
                log(&format!("Connexion refusée (HTTP {}). Vérifie PULSE_EMAIL et PULSE_PASSWORD.", r.status().as_u16()));
                false
            }
            Err(_) => {
                log("Serveur PocketBase injoignable.");
                false
            }
        }
    }

    async fn call(&self, method: reqwest::Method, path: &str, body: Option<&Value>) -> Outcome {
        let mut request = self.http.request(method, self.url(path));
        if let Some(token) = &self.token {
            request = request.header("Authorization", token);
        }
        if let Some(body) = body {
            request = request.json(body);
        }
        match request.send().await {
            Err(_) => Outcome::Offline,
            Ok(r) if r.status().as_u16() == 401 => Outcome::Unauthorized,
            Ok(r) if r.status().is_success() => Outcome::Done(r.json().await.unwrap_or(Value::Null)),
            Ok(r) => Outcome::Failed(r.status().as_u16()),
        }
    }

    /// Same as `call`, logging back in once if the session expired.
    async fn authed(&mut self, method: reqwest::Method, path: &str, body: Option<&Value>) -> Outcome {
        if self.token.is_none() && !self.login().await {
            return Outcome::Offline;
        }
        match self.call(method.clone(), path, body).await {
            Outcome::Unauthorized => {
                if self.login().await {
                    self.call(method, path, body).await
                } else {
                    Outcome::Unauthorized
                }
            }
            other => other,
        }
    }

    async fn list_apps(&mut self) -> Option<Vec<AppRecord>> {
        match self
            .authed(reqwest::Method::GET, "collections/pulse_apps/records?perPage=200", None)
            .await
        {
            Outcome::Done(value) => serde_json::from_value::<List>(value).ok().map(|l| l.items),
            Outcome::Failed(404) => {
                log("Collection pulse_apps introuvable : importe pulse_collections.json sur le serveur.");
                None
            }
            _ => None,
        }
    }

    /// Adds one check to the day's counters.
    async fn record(&mut self, app: &str, ok: bool, latency: u64) {
        let day = today();
        let key = (app.to_string(), day.clone());
        let add = json!({ "total+": 1, "ok+": u8::from(ok), "latency_sum+": latency });

        if let Some(id) = self.day_records.get(&key).cloned() {
            match self
                .authed(reqwest::Method::PATCH, &format!("collections/pulse_uptime/records/{id}"), Some(&add))
                .await
            {
                Outcome::Done(_) => return,
                Outcome::Failed(404) => {
                    self.day_records.remove(&key);
                }
                _ => return,
            }
        }

        let filter = format!("app=\"{app}\" && day=\"{day}\"");
        let path = format!("collections/pulse_uptime/records?perPage=1&fields=id&filter={}", encode(&filter));
        if let Outcome::Done(value) = self.authed(reqwest::Method::GET, &path, None).await {
            if let Some(found) = serde_json::from_value::<Found>(value).ok().and_then(|f| f.items.into_iter().next()) {
                self.day_records.insert(key, found.id.clone());
                self.authed(reqwest::Method::PATCH, &format!("collections/pulse_uptime/records/{}", found.id), Some(&add))
                    .await;
                return;
            }
        } else {
            return;
        }

        let create = json!({ "app": app, "day": day, "ok": u8::from(ok), "total": 1, "latency_sum": latency });
        match self.authed(reqwest::Method::POST, "collections/pulse_uptime/records", Some(&create)).await {
            Outcome::Done(value) => {
                if let Some(id) = value.get("id").and_then(Value::as_str) {
                    self.day_records.insert(key, id.to_string());
                }
            }
            Outcome::Failed(code) => log(&format!("Enregistrement impossible (HTTP {code}). La collection pulse_uptime existe-t-elle ?")),
            _ => {}
        }
    }

    async fn tick(&mut self) {
        let Some(apps) = self.list_apps().await else {
            return;
        };
        let targets: Vec<AppRecord> = apps
            .into_iter()
            .filter(|a| matches!(a.check_kind.as_str(), "http" | "tcp"))
            .collect();
        if targets.is_empty() {
            log("Aucune application à surveiller. Configure une surveillance dans le Studio.");
            return;
        }

        let mut tasks = Vec::new();
        for app in &targets {
            if !valid_target(&app.check_kind, &app.check_target) {
                log(&format!("{} : adresse de surveillance invalide, ignorée.", app.name));
                continue;
            }
            let client = self.http.clone();
            let (id, kind, target) = (app.id.clone(), app.check_kind.clone(), app.check_target.clone());
            tasks.push(tokio::spawn(async move {
                let (ok, latency) = probe(&client, &kind, &target).await;
                (id, ok, latency)
            }));
        }

        for task in tasks {
            let Ok((id, ok, latency)) = task.await else { continue };
            let Some(app) = targets.iter().find(|a| a.id == id) else { continue };
            self.record(&id, ok, latency).await;

            let track = self.tracks.entry(id.clone()).or_default();
            track.fails = if ok { 0 } else { track.fails + 1 };
            let fails = track.fails;
            let stale = track.written.is_none_or(|t| t.elapsed() >= REFRESH_EVERY);

            let change = decide_status(&app.status, &app.status_message, ok, fails);
            if !(stale || app.check_ok != ok || change.is_some()) {
                continue;
            }
            let mut patch = json!({ "check_ok": ok, "check_latency": latency, "checked_at": now_pb() });
            if let Some((status, message)) = change {
                patch["status"] = json!(status);
                patch["status_message"] = json!(message);
                log(&format!("{} : état automatique -> {status}", app.name));
            }
            let saved = self
                .authed(reqwest::Method::PATCH, &format!("collections/pulse_apps/records/{id}"), Some(&patch))
                .await;
            if matches!(saved, Outcome::Done(_))
                && let Some(track) = self.tracks.get_mut(&id)
            {
                track.written = Some(Instant::now());
            }
            log(&format!("{} : {} ({latency} ms)", app.name, if ok { "en ligne" } else { "HORS LIGNE" }));
        }
    }
}

/// Percent-encodes a query value (only what a PocketBase filter needs).
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[tokio::main]
async fn main() {
    let (Ok(email), Ok(password)) = (env::var("PULSE_EMAIL"), env::var("PULSE_PASSWORD")) else {
        eprintln!("Définis PULSE_EMAIL et PULSE_PASSWORD (un compte de la collection pulse_editors).");
        std::process::exit(1);
    };
    let base = env::var("PULSE_URL").unwrap_or_else(|_| DEFAULT_URL.to_string());
    let interval = env::var("PULSE_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60)
        .max(15);

    let http = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(concat!("NexoraPulseMonitor/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("HTTP client");

    let mut monitor = Monitor {
        http,
        base: base.trim_end_matches('/').to_string(),
        email,
        password,
        token: None,
        tracks: HashMap::new(),
        day_records: HashMap::new(),
    };

    log(&format!("pulse-monitor démarré : {} toutes les {interval} s. Ctrl+C pour arrêter.", monitor.base));
    let mut ticker = tokio::time::interval(Duration::from_secs(interval));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = ticker.tick() => monitor.tick().await,
            _ = tokio::signal::ctrl_c() => {
                log("Arrêt.");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_are_validated_per_kind() {
        assert!(valid_target("http", "https://exemple.fr/api/health"));
        assert!(!valid_target("http", "exemple.fr"));
        assert!(valid_target("tcp", "92.49.99.59:25565"));
        assert!(!valid_target("tcp", "92.49.99.59"));
        assert!(!valid_target("tcp", ":25565"));
        assert!(!valid_target("none", "x:1"));
    }

    #[test]
    fn needs_two_failures_before_declaring_down() {
        assert_eq!(decide_status("operational", "", false, 1), None);
        assert_eq!(decide_status("operational", "", false, 2), Some(("major_outage", AUTO_MESSAGE)));
        assert_eq!(decide_status("unknown", "", false, 3), Some(("major_outage", AUTO_MESSAGE)));
    }

    #[test]
    fn never_overwrites_a_manual_state() {
        assert_eq!(decide_status("maintenance", "Mise à jour", false, 5), None);
        assert_eq!(decide_status("maintenance", "Mise à jour", true, 0), None);
        assert_eq!(decide_status("degraded", "", true, 0), None);
        assert_eq!(decide_status("major_outage", "Panne du fournisseur", true, 0), None);
    }

    #[test]
    fn recovers_an_automatic_outage_and_fills_unknown() {
        assert_eq!(decide_status("major_outage", AUTO_MESSAGE, true, 0), Some(("operational", "")));
        assert_eq!(decide_status("unknown", "", true, 0), Some(("operational", "")));
        assert_eq!(decide_status("operational", "", true, 0), None);
    }

    #[test]
    fn filter_values_are_encoded() {
        assert_eq!(encode("app=\"a\" && day=\"d\""), "app%3D%22a%22%20%26%26%20day%3D%22d%22");
    }
}
