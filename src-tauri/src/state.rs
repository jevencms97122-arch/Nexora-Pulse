use crate::{
    cache::Cache,
    models::{Editor, Prefs, Snapshot},
    pb::Pb,
};
use std::sync::{
    RwLock,
    atomic::{AtomicBool, Ordering},
};
use tokio::sync::{Mutex as AsyncMutex, Notify};

#[derive(Clone)]
pub struct Session {
    pub token: String,
    pub editor: Editor,
}

pub struct AppState {
    pub pb: Pb,
    pub store: Pb,
    pub cache: Cache,
    pub session: RwLock<Option<Session>>,
    pub snapshot: RwLock<Snapshot>,
    pub prefs: RwLock<Prefs>,
    pub wake: Notify,
    pub sync_lock: AsyncMutex<()>,
    pub live: AtomicBool,
    pub mica: AtomicBool,
    pub start_hidden: AtomicBool,
    pub shown: AtomicBool,
}

impl AppState {
    pub fn token(&self) -> Option<String> {
        self.session
            .read()
            .ok()
            .and_then(|s| s.as_ref().map(|s| s.token.clone()))
    }

    pub fn is_live(&self) -> bool {
        self.live.load(Ordering::SeqCst)
    }

    pub fn current_prefs(&self) -> Prefs {
        self.prefs.read().map(|p| p.clone()).unwrap_or_default()
    }

    pub fn current_snapshot(&self) -> Snapshot {
        self.snapshot.read().map(|s| s.clone()).unwrap_or_default()
    }
}
