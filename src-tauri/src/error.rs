use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Le serveur Nexora est injoignable. Vérifie ta connexion.")]
    Offline,
    #[error("Ta session a expiré. Reconnecte-toi.")]
    Unauthorized,
    #[error("Ce compte n'a pas le droit de faire cette action.")]
    Forbidden,
    #[error("Le serveur n'est pas encore configuré pour Nexora Pulse.")]
    NotSetup,
    #[error("{0}")]
    Message(String),
}

impl Error {
    pub fn msg(text: impl Into<String>) -> Self {
        Self::Message(text.into())
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
