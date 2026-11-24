use crate::{
    auth::fresh_token,
    error::{Error, Result},
    markdown,
    models::*,
    state::AppState,
    sync,
};
use base64::Engine;
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, State};

const MAX_COVER_BYTES: usize = 5 * 1024 * 1024;
const ACCENTS: [&str; 8] = [
    "#0a84ff", "#5e5ce6", "#30b0c7", "#34c759", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff",
];

fn one_of(allowed: &[&str], value: &str, label: &str) -> Result<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(Error::msg(format!("{label} invalide.")))
    }
}

fn required(value: &str, label: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        Err(Error::msg(format!("{label} : champ obligatoire.")))
    } else {
        Ok(value.to_string())
    }
}

fn date_or_now(value: &str) -> String {
    let value = normalize_date(value);
    if value.is_empty() { now() } else { value }
}

fn slugify(name: &str) -> String {
    let mut out = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

async fn upsert(
    state: &AppState,
    collection: &str,
    id: Option<&str>,
    body: &Value,
    token: &str,
) -> Result<String> {
    let record = match id.filter(|id| !id.is_empty()) {
        Some(id) => state.pb.update(collection, id, body, token).await?,
        None => state.pb.create(collection, body, token).await?,
    };
    record
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| Error::msg("Réponse inattendue du serveur."))
}

#[derive(Deserialize)]
#[serde(default)]
#[derive(Default)]
pub struct PostInput {
    id: Option<String>,
    title: String,
    summary: String,
    body: String,
    kind: String,
    apps: Vec<String>,
    pinned: bool,
    state: String,
    publish_at: String,
    remove_cover: bool,
}

#[derive(Deserialize)]
pub struct CoverInput {
    name: String,
    data: String,
}

fn cover_mime(name: &str) -> Result<&'static str> {
    match name.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "webp" => Ok("image/webp"),
        _ => Err(Error::msg("La couverture doit être en PNG, JPEG ou WebP.")),
    }
}

#[tauri::command]
pub async fn save_post(
    app: AppHandle,
    state: State<'_, AppState>,
    input: PostInput,
    cover: Option<CoverInput>,
) -> Result<Snapshot> {
    let title = required(&input.title, "Titre")?;
    one_of(&POST_KINDS, &input.kind, "Type")?;
    one_of(&PUBLISH_STATES, &input.state, "État")?;
    let upload = match cover {
        Some(cover) => {
            let mime = cover_mime(&cover.name)?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(cover.data.as_bytes())
                .map_err(|_| Error::msg("Image de couverture illisible."))?;
            if bytes.len() > MAX_COVER_BYTES {
                return Err(Error::msg("La couverture dépasse 5 Mo."));
            }
            Some((cover.name, mime, bytes))
        }
        None => None,
    };
    let token = fresh_token(&state).await?;
    let mut body = json!({
        "title": title,
        "summary": input.summary.trim(),
        "body": input.body,
        "kind": input.kind,
        "apps": input.apps,
        "pinned": input.pinned,
        "state": input.state,
        "publish_at": date_or_now(&input.publish_at),
    });
    if input.remove_cover {
        body["cover"] = Value::Null;
    }
    let id = upsert(&state, "pulse_posts", input.id.as_deref(), &body, &token).await?;
    if let Some((name, mime, bytes)) = upload {
        state.pb.upload("pulse_posts", &id, "cover", name, mime, bytes, &token).await?;
    }
    Ok(sync::refresh(&app).await)
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct ReleaseInput {
    id: Option<String>,
    app: String,
    version: String,
    title: String,
    notes: String,
    channel: String,
    state: String,
    released_at: String,
}

#[tauri::command]
pub async fn save_release(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ReleaseInput,
) -> Result<Snapshot> {
    let target = required(&input.app, "Application")?;
    let version = required(&input.version, "Version")?;
    one_of(&CHANNELS, &input.channel, "Canal")?;
    one_of(&PUBLISH_STATES, &input.state, "État")?;
    let token = fresh_token(&state).await?;
    let body = json!({
        "app": target,
        "version": version,
        "title": input.title.trim(),
        "notes": input.notes,
        "channel": input.channel,
        "state": input.state,
        "released_at": date_or_now(&input.released_at),
    });
    upsert(&state, "pulse_releases", input.id.as_deref(), &body, &token).await?;
    Ok(sync::refresh(&app).await)
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct AppInput {
    id: Option<String>,
    name: String,
    tagline: String,
    accent: String,
    store_id: String,
    status: String,
    status_message: String,
    sort: i64,
    visible: bool,
}

#[tauri::command]
pub async fn save_app(app: AppHandle, state: State<'_, AppState>, input: AppInput) -> Result<Snapshot> {
    let name = required(&input.name, "Nom")?;
    one_of(&STATUSES, &input.status, "État")?;
    let accent = input.accent.trim();
    let valid_accent = accent.len() == 7
        && accent.starts_with('#')
        && accent[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid_accent {
        return Err(Error::msg("Couleur invalide."));
    }
    let token = fresh_token(&state).await?;
    let mut body = json!({
        "name": name,
        "tagline": input.tagline.trim(),
        "accent": accent,
        "store_id": input.store_id.trim(),
        "status": input.status,
        "status_message": input.status_message.trim(),
        "sort": input.sort,
        "visible": input.visible,
    });
    if input.id.as_deref().unwrap_or("").is_empty() {
        body["slug"] = json!(slugify(&name));
    }
    upsert(&state, "pulse_apps", input.id.as_deref(), &body, &token).await?;
    Ok(sync::refresh(&app).await)
}

/// Creates a Pulse entry for each app of the Nexora Store catalog that has none yet.
#[tauri::command]
pub async fn import_store_apps(app: AppHandle, state: State<'_, AppState>) -> Result<Snapshot> {
    let token = fresh_token(&state).await?;
    let existing = state.pb.list_all::<App>("pulse_apps", "sort", Some(&token)).await?;
    let catalog = sync::store_catalog(&state).await;
    if catalog.is_empty() {
        return Err(Error::msg("Le catalogue de Nexora Store est injoignable."));
    }
    let mut sort = existing.iter().map(|a| a.sort).max().unwrap_or(0);
    let mut entries: Vec<(String, String)> =
        catalog.into_iter().map(|c| (c.name, c.id)).collect();
    entries.push(("Nexora Store".to_string(), String::new()));
    for (index, (name, store_id)) in entries.into_iter().enumerate() {
        let known = existing.iter().any(|a| {
            (!store_id.is_empty() && a.store_id == store_id) || a.name.eq_ignore_ascii_case(&name)
        });
        if known {
            continue;
        }
        sort += 10;
        let body = json!({
            "name": name,
            "slug": slugify(&name),
            "tagline": "",
            "accent": ACCENTS[index % ACCENTS.len()],
            "store_id": store_id,
            "status": "unknown",
            "status_message": "",
            "sort": sort,
            "visible": true,
        });
        state.pb.create("pulse_apps", &body, &token).await?;
    }
    Ok(sync::refresh(&app).await)
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct IncidentInput {
    title: String,
    severity: String,
    apps: Vec<String>,
    message: String,
}

#[tauri::command]
pub async fn open_incident(
    app: AppHandle,
    state: State<'_, AppState>,
    input: IncidentInput,
) -> Result<Snapshot> {
    let title = required(&input.title, "Titre")?;
    let message = required(&input.message, "Message")?;
    one_of(&SEVERITIES, &input.severity, "Gravité")?;
    let token = fresh_token(&state).await?;
    let body = json!({
        "title": title,
        "severity": input.severity,
        "phase": "investigating",
        "apps": input.apps,
        "started_at": now(),
    });
    let id = upsert(&state, "pulse_incidents", None, &body, &token).await?;
    let update = json!({ "incident": id, "phase": "investigating", "message": message });
    state.pb.create("pulse_incident_updates", &update, &token).await?;
    Ok(sync::refresh(&app).await)
}

#[tauri::command]
pub async fn update_incident(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    phase: String,
    message: String,
) -> Result<Snapshot> {
    let message = required(&message, "Message")?;
    one_of(&PHASES, &phase, "Étape")?;
    let token = fresh_token(&state).await?;
    let update = json!({ "incident": id, "phase": phase, "message": message });
    state.pb.create("pulse_incident_updates", &update, &token).await?;
    let resolved_at = if phase == "resolved" { now() } else { String::new() };
    let patch = json!({ "phase": phase, "resolved_at": resolved_at });
    state.pb.update("pulse_incidents", &id, &patch, &token).await?;
    Ok(sync::refresh(&app).await)
}

#[tauri::command]
pub async fn delete_record(
    app: AppHandle,
    state: State<'_, AppState>,
    collection: String,
    id: String,
) -> Result<Snapshot> {
    one_of(&["pulse_posts", "pulse_releases", "pulse_incidents"], &collection, "Collection")?;
    let token = fresh_token(&state).await?;
    state.pb.delete(&collection, &id, &token).await?;
    Ok(sync::refresh(&app).await)
}

#[tauri::command]
pub fn render_markdown(text: String) -> String {
    markdown::to_html(&text)
}

#[cfg(test)]
mod tests {
    use super::{cover_mime, slugify};

    #[test]
    fn slugs_are_clean() {
        assert_eq!(slugify("Nexora  Craft!"), "nexora-craft");
        assert_eq!(slugify("  Nexora Tools "), "nexora-tools");
    }

    #[test]
    fn only_images_are_accepted_as_covers() {
        assert_eq!(cover_mime("a.JPG").unwrap(), "image/jpeg");
        assert!(cover_mime("a.svg").is_err());
    }
}
