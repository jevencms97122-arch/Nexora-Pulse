use pulldown_cmark::{Options, Parser, html};

/// Renders Markdown to HTML that is safe to inject in the interface.
pub fn to_html(markdown: &str) -> String {
    if markdown.trim().is_empty() {
        return String::new();
    }
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    let mut raw = String::with_capacity(markdown.len() * 2);
    html::push_html(&mut raw, Parser::new_ext(markdown, options));
    ammonia::Builder::default()
        .url_schemes(["http", "https", "mailto"].into_iter().collect())
        .link_rel(Some("noopener noreferrer"))
        .clean(&raw)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::to_html;

    #[test]
    fn renders_markdown() {
        assert!(to_html("**Salut**").contains("<strong>Salut</strong>"));
    }

    #[test]
    fn strips_scripts_and_dangerous_links() {
        let html = to_html("<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>");
        assert!(!html.contains("<script"));
        assert!(!html.contains("javascript:"));
        assert!(!html.contains("onerror"));
    }
}
