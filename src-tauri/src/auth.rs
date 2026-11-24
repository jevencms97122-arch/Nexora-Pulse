use crate::{
    error::{Error, Result},
    models::Editor,
    state::{AppState, Session},
    sync,
};
use tauri::{AppHandle, State};

const SERVICE: &str = "com.nexora.pulse";
const ACCOUNT: &str = "editor-token";

fn entry() -> Option<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT).ok()
}

fn read_token() -> Option<String> {
    entry()?.get_password().ok()
}

fn write_token(token: &str) {
    if let Some(entry) = entry() {
        let _ = entry.set_password(token);
    }
}

fn clear_token() {
    if let Some(entry) = entry() {
        let _ = entry.delete_credential();
    }
}

fn set_session(state: &AppState, session: Option<Session>) {
    match &session {
        Some(s) => write_token(&s.token),
        None => clear_token(),
    }
    if let Ok(mut slot) = state.session.write() {
        *slot = session;
    }
}

/// Restores the saved editor session. A network failure keeps the token for later.
pub async fn restore(state: &AppState) {
    let Some(token) = read_token() else { return };
    match state.pb.refresh(&token).await {
        Ok((token, editor)) => set_session(state, Some(Session { token, editor })),
        Err(Error::Offline) => {}
        Err(_) => set_session(state, None),
    }
}

/// A valid token for a write. Clears the session when the server rejects it.
pub async fn fresh_token(state: &AppState) -> Result<String> {
    let token = match state.token() {
        Some(token) => token,
        None => match read_token() {
            Some(token) => token,
            None => return Err(Error::Unauthorized),
        },
    };
    match state.pb.refresh(&token).await {
        Ok((token, editor)) => {
            set_session(state, Some(Session { token: token.clone(), editor }));
            Ok(token)
        }
        Err(Error::Unauthorized) => {
            set_session(state, None);
            Err(Error::Unauthorized)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn session(state: State<'_, AppState>) -> Option<Editor> {
    state
        .session
        .read()
        .ok()
        .and_then(|s| s.as_ref().map(|s| s.editor.clone()))
}

#[tauri::command]
pub async fn login(
    app: AppHandle,
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<Editor> {
    let email = email.trim();
    if email.is_empty() || password.is_empty() {
        return Err(Error::msg("Renseigne ton e-mail et ton mot de passe."));
    }
    let (token, editor) = state.pb.login(email, &password).await?;
    set_session(&state, Some(Session { token, editor: editor.clone() }));
    sync::refresh(&app).await;
    Ok(editor)
}

#[tauri::command]
pub async fn logout(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    set_session(&state, None);
    sync::refresh(&app).await;
    Ok(())
}
