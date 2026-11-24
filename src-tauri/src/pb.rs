use crate::{
    error::{Error, Result},
    models::Editor,
};
use reqwest::{Client, RequestBuilder, Response, StatusCode, multipart};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::time::Duration;

const USER_AGENT: &str = concat!("NexoraPulse/", env!("CARGO_PKG_VERSION"));

/// Small PocketBase REST client.
#[derive(Clone)]
pub struct Pb {
    http: Client,
    pub base: String,
}

#[derive(Deserialize)]
struct Page<T> {
    items: Vec<T>,
    #[serde(rename = "totalPages")]
    total_pages: u32,
}

#[derive(Deserialize)]
struct AuthResponse {
    token: String,
    record: Editor,
}

impl Pb {
    pub fn new(base: &str) -> Self {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(25))
            .user_agent(USER_AGENT)
            .build()
            .expect("HTTP client");
        Self {
            http,
            base: base.trim_end_matches('/').to_string(),
        }
    }

    fn records(&self, collection: &str) -> String {
        format!("{}/api/collections/{collection}/records", self.base)
    }

    pub fn file_url(&self, collection: &str, id: &str, file: &str) -> String {
        format!("{}/api/files/{collection}/{id}/{file}", self.base)
    }

    fn authed(req: RequestBuilder, token: Option<&str>) -> RequestBuilder {
        match token {
            Some(token) => req.header("Authorization", token),
            None => req,
        }
    }

    pub async fn list_all<T: DeserializeOwned>(
        &self,
        collection: &str,
        sort: &str,
        token: Option<&str>,
    ) -> Result<Vec<T>> {
        let mut out = Vec::new();
        let mut page = 1u32;
        loop {
            let query = [
                ("page", page.to_string()),
                ("perPage", "200".to_string()),
                ("sort", sort.to_string()),
                ("skipTotal", "0".to_string()),
            ];
            let req = Self::authed(self.http.get(self.records(collection)).query(&query), token);
            let resp = req.send().await.map_err(|_| Error::Offline)?;
            if resp.status() == StatusCode::NOT_FOUND {
                return Err(Error::NotSetup);
            }
            let data: Page<T> = read_json(resp).await?;
            out.extend(data.items);
            if page >= data.total_pages {
                return Ok(out);
            }
            page += 1;
        }
    }

    pub async fn create(&self, collection: &str, body: &Value, token: &str) -> Result<Value> {
        let req = self.http.post(self.records(collection)).json(body);
        let resp = Self::authed(req, Some(token)).send().await.map_err(|_| Error::Offline)?;
        read_json(resp).await
    }

    pub async fn update(&self, collection: &str, id: &str, body: &Value, token: &str) -> Result<Value> {
        let url = format!("{}/{id}", self.records(collection));
        let resp = Self::authed(self.http.patch(url).json(body), Some(token))
            .send()
            .await
            .map_err(|_| Error::Offline)?;
        read_json(resp).await
    }

    pub async fn delete(&self, collection: &str, id: &str, token: &str) -> Result<()> {
        let url = format!("{}/{id}", self.records(collection));
        let resp = Self::authed(self.http.delete(url), Some(token))
            .send()
            .await
            .map_err(|_| Error::Offline)?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(read_error(resp).await)
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn upload(
        &self,
        collection: &str,
        id: &str,
        field: &str,
        file_name: String,
        mime: &str,
        bytes: Vec<u8>,
        token: &str,
    ) -> Result<()> {
        let part = multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime)
            .map_err(|e| Error::msg(e.to_string()))?;
        let form = multipart::Form::new().part(field.to_string(), part);
        let url = format!("{}/{id}", self.records(collection));
        let resp = Self::authed(self.http.patch(url).multipart(form), Some(token))
            .send()
            .await
            .map_err(|_| Error::Offline)?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(read_error(resp).await)
        }
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<(String, Editor)> {
        let url = format!("{}/api/collections/pulse_editors/auth-with-password", self.base);
        let resp = self
            .http
            .post(url)
            .json(&json!({ "identity": email, "password": password }))
            .send()
            .await
            .map_err(|_| Error::Offline)?;
        match resp.status() {
            StatusCode::NOT_FOUND => Err(Error::NotSetup),
            StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                Err(Error::msg("E-mail ou mot de passe incorrect."))
            }
            _ => {
                let data: AuthResponse = read_json(resp).await?;
                Ok((data.token, data.record))
            }
        }
    }

    pub async fn refresh(&self, token: &str) -> Result<(String, Editor)> {
        let url = format!("{}/api/collections/pulse_editors/auth-refresh", self.base);
        let resp = Self::authed(self.http.post(url), Some(token))
            .send()
            .await
            .map_err(|_| Error::Offline)?;
        match resp.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND => {
                Err(Error::Unauthorized)
            }
            _ => {
                let data: AuthResponse = read_json(resp).await?;
                Ok((data.token, data.record))
            }
        }
    }
}

async fn read_json<T: DeserializeOwned>(resp: Response) -> Result<T> {
    if !resp.status().is_success() {
        return Err(read_error(resp).await);
    }
    resp.json()
        .await
        .map_err(|_| Error::msg("Réponse inattendue du serveur."))
}

async fn read_error(resp: Response) -> Error {
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    match status {
        StatusCode::UNAUTHORIZED => Error::Unauthorized,
        StatusCode::FORBIDDEN => Error::Forbidden,
        StatusCode::NOT_FOUND => Error::msg("Élément introuvable sur le serveur."),
        StatusCode::BAD_REQUEST => Error::msg(validation_message(&body)),
        _ => Error::msg(format!("Erreur du serveur ({}).", status.as_u16())),
    }
}

fn validation_message(body: &Value) -> String {
    let fields: Vec<&str> = body
        .get("data")
        .and_then(Value::as_object)
        .map(|data| data.keys().map(String::as_str).collect())
        .unwrap_or_default();
    if fields.is_empty() {
        "Le serveur a refusé ces données.".to_string()
    } else {
        format!("Champ invalide : {}.", fields.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::validation_message;
    use serde_json::json;

    #[test]
    fn validation_errors_name_the_fields() {
        let body = json!({ "data": { "title": { "code": "validation_required" } } });
        assert_eq!(validation_message(&body), "Champ invalide : title.");
        assert_eq!(validation_message(&json!({})), "Le serveur a refusé ces données.");
    }
}
