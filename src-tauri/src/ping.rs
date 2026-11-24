//! Live response times. Whenever someone opens the status page, the app itself tries
//! each address configured in the Studio and shows how long it took.

use crate::state::AppState;
use futures_util::future::join_all;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::State;

const LIMIT: Duration = Duration::from_secs(10);
/// A safety cap: the status page never fires more pings than this at once.
const MAX_PINGS: usize = 30;

/// Is the address usable for this kind of test?
pub fn valid_target(kind: &str, target: &str) -> bool {
    match kind {
        "http" => target.starts_with("http://") || target.starts_with("https://"),
        "tcp" => target
            .rsplit_once(':')
            .is_some_and(|(host, port)| !host.is_empty() && port.parse::<u16>().is_ok()),
        _ => false,
    }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(LIMIT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(concat!("NexoraPulse/", env!("CARGO_PKG_VERSION"), " ping"))
        .build()
        .expect("HTTP client")
}

pub struct Probe {
    /// Online means: an HTTP answer below 500, or an accepted TCP connection.
    pub ok: bool,
    pub latency_ms: u64,
    pub detail: String,
}

/// Tries an address once.
pub async fn probe(client: &reqwest::Client, kind: &str, target: &str) -> Probe {
    let started = Instant::now();
    let (ok, detail) = if kind == "http" {
        match client.get(target).send().await {
            Ok(response) => {
                let code = response.status().as_u16();
                let note = match code {
                    404 => " : le serveur répond, mais cette page n'existe pas",
                    400..=499 => " : le serveur répond",
                    _ => "",
                };
                (code < 500, format!("Réponse HTTP {code}{note}"))
            }
            Err(e) if e.is_timeout() => (false, "Aucune réponse en 10 secondes".to_string()),
            Err(_) => (false, "Connexion impossible : serveur éteint, port fermé ou adresse incorrecte".to_string()),
        }
    } else {
        match tokio::time::timeout(LIMIT, tokio::net::TcpStream::connect(target)).await {
            Ok(Ok(_)) => (true, "Connexion réussie".to_string()),
            Ok(Err(_)) => (false, "Connexion refusée ou adresse introuvable".to_string()),
            Err(_) => (false, "Aucune réponse en 10 secondes".to_string()),
        }
    };
    Probe { ok, latency_ms: started.elapsed().as_millis() as u64, detail }
}

#[derive(Serialize)]
pub struct Ping {
    app: String,
    ok: bool,
    latency_ms: u64,
}

/// Pings every visible app that has a test address, all at once.
#[tauri::command]
pub async fn ping_apps(state: State<'_, AppState>) -> Result<Vec<Ping>, ()> {
    let targets: Vec<(String, String, String)> = state
        .current_snapshot()
        .apps
        .into_iter()
        .filter(|a| a.visible && valid_target(&a.check_kind, a.check_target.trim()))
        .take(MAX_PINGS)
        .map(|a| (a.id, a.check_kind, a.check_target.trim().to_string()))
        .collect();
    let client = client();
    Ok(join_all(targets.iter().map(|(id, kind, target)| {
        let client = &client;
        async move {
            let result = probe(client, kind, target).await;
            Ping { app: id.clone(), ok: result.ok, latency_ms: result.latency_ms }
        }
    }))
    .await)
}

#[cfg(test)]
mod tests {
    use super::valid_target;

    #[test]
    fn addresses_are_checked_per_kind() {
        assert!(valid_target("http", "https://a.fr/health"));
        assert!(!valid_target("http", "a.fr"));
        assert!(valid_target("tcp", "92.49.99.59:25565"));
        assert!(!valid_target("tcp", "92.49.99.59"));
        assert!(!valid_target("none", "a:1"));
    }
}
