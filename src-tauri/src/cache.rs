use crate::error::{Error, Result};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};
use std::{path::Path, sync::Mutex};

/// Local SQLite store: offline snapshot, preferences and already-notified items.
pub struct Cache {
    db: Mutex<Connection>,
}

impl Cache {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path).map_err(|e| Error::msg(format!("Cache local : {e}")))?;
        Self::init(db)
    }

    #[cfg(test)]
    pub fn memory() -> Result<Self> {
        Self::init(Connection::open_in_memory().map_err(|e| Error::msg(e.to_string()))?)
    }

    fn init(db: Connection) -> Result<Self> {
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS seen (key TEXT PRIMARY KEY);",
        )
        .map_err(|e| Error::msg(format!("Cache local : {e}")))?;
        Ok(Self { db: Mutex::new(db) })
    }

    pub fn get(&self, key: &str) -> Option<String> {
        let db = self.db.lock().ok()?;
        db.query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }

    pub fn set(&self, key: &str, value: &str) {
        if let Ok(db) = self.db.lock() {
            let _ = db.execute(
                "INSERT INTO kv (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            );
        }
    }

    pub fn remove(&self, key: &str) {
        if let Ok(db) = self.db.lock() {
            let _ = db.execute("DELETE FROM kv WHERE key = ?1", [key]);
        }
    }

    pub fn get_json<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        serde_json::from_str(&self.get(key)?).ok()
    }

    pub fn set_json<T: Serialize>(&self, key: &str, value: &T) {
        if let Ok(text) = serde_json::to_string(value) {
            self.set(key, &text);
        }
    }

    /// Returns true the first time a key is seen.
    pub fn mark_seen(&self, key: &str) -> bool {
        self.db
            .lock()
            .ok()
            .and_then(|db| db.execute("INSERT OR IGNORE INTO seen (key) VALUES (?1)", [key]).ok())
            .is_some_and(|changed| changed > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::Cache;

    #[test]
    fn stores_values_and_seen_keys() {
        let cache = Cache::memory().unwrap();
        cache.set("a", "1");
        cache.set("a", "2");
        assert_eq!(cache.get("a").as_deref(), Some("2"));
        cache.remove("a");
        assert_eq!(cache.get("a"), None);
        assert!(cache.mark_seen("post:1"));
        assert!(!cache.mark_seen("post:1"));
    }
}
