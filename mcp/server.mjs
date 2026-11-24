#!/usr/bin/env node
// Nexora Pulse MCP server: lets Claude publish announcements, updates, statuses and
// incidents straight to the Pulse backend (PocketBase), from any conversation.
//
// Credentials come from mcp/.env (ignored by Git) or the environment:
//   PULSE_EMAIL, PULSE_PASSWORD  a `pulse_editors` account
//   PULSE_URL                    optional, defaults to the Pulse server
//
// Never write to stdout here: it carries the MCP protocol. Logs go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** Reads KEY=VALUE lines from mcp/.env without overriding real environment variables. */
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv(join(here, ".env"));

const BASE = (process.env.PULSE_URL || "http://92.49.99.59:8097").replace(/\/+$/, "");
const EDITOR_COLLECTION = "pulse_editors";

// ---------------------------------------------------------------------------
// PocketBase access
// ---------------------------------------------------------------------------

let token = null;

async function login() {
  const email = process.env.PULSE_EMAIL;
  const password = process.env.PULSE_PASSWORD;
  if (!email || !password) {
    throw new Error(`Identifiants manquants : renseigne PULSE_EMAIL et PULSE_PASSWORD dans ${join(here, ".env")}.`);
  }
  let res;
  try {
    res = await fetch(`${BASE}/api/collections/${EDITOR_COLLECTION}/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    });
  } catch {
    throw new Error(`Serveur Nexora Pulse injoignable (${BASE}).`);
  }
  if (!res.ok) throw new Error("Connexion refusée : vérifie l'e-mail et le mot de passe du compte pulse_editors dans mcp/.env.");
  token = (await res.json()).token;
}

function describeError(status, body) {
  const fields = body && typeof body.data === "object" ? Object.entries(body.data) : [];
  if (fields.length) return `Données refusées : ${fields.map(([name, err]) => `${name} (${err?.message ?? "invalide"})`).join(", ")}.`;
  if (status === 403) return "Ce compte n'a pas le droit de faire cette action.";
  if (status === 404) return "Élément introuvable sur le serveur.";
  return body?.message || `Erreur du serveur (${status}).`;
}

async function pb(method, path, body, retry = true) {
  if (!token) await login();
  let res;
  try {
    res = await fetch(`${BASE}/api/${path}`, {
      method,
      headers: { Authorization: token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Serveur Nexora Pulse injoignable (${BASE}).`);
  }
  if (res.status === 401 && retry) {
    token = null;
    return pb(method, path, body, false);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(describeError(res.status, data));
  return data;
}

/** Sends a form (file upload) to PocketBase. Same sign-in and error handling as pb(). */
async function pbForm(method, path, form, retry = true) {
  if (!token) await login();
  let res;
  try {
    res = await fetch(`${BASE}/api/${path}`, { method, headers: { Authorization: token }, body: form });
  } catch {
    throw new Error(`Serveur Nexora Pulse injoignable (${BASE}).`);
  }
  if (res.status === 401 && retry) {
    token = null;
    return pbForm(method, path, form, false);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(describeError(res.status, data));
  return data;
}

const COVER_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Attaches a local image as the cover of an announcement. */
async function uploadCover(postId, file) {
  const type = COVER_TYPES[extname(file).toLowerCase()];
  if (!type) throw new Error("La couverture doit être une image PNG, JPEG ou WebP.");
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  if (statSync(file).size > MAX_COVER_BYTES) throw new Error("La couverture dépasse 5 Mo.");
  const form = new FormData();
  form.append("cover", new Blob([readFileSync(file)], { type }), basename(file));
  await pbForm("PATCH", `collections/pulse_posts/records/${postId}`, form);
}

const records = (collection, query = "") => `collections/${collection}/records${query}`;
const list = async (collection, query) => (await pb("GET", records(collection, query))).items ?? [];

/** PocketBase date format, from "now" or any date the user gave. */
function pbDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`Date illisible : « ${value} ». Utilise par exemple 2026-12-01T18:00:00+01:00.`);
  return date.toISOString().replace("T", " ");
}

// ---------------------------------------------------------------------------
// Apps are referred to by name ("Nexora Music", "music") as well as by id
// ---------------------------------------------------------------------------

const STATUS_LABEL = {
  unknown: "Non renseigné",
  operational: "Opérationnel",
  degraded: "Performances dégradées",
  partial_outage: "Panne partielle",
  major_outage: "Panne majeure",
  maintenance: "Maintenance",
};

const normalize = (text) =>
  String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^nexora[\s-]*/, "")
    .trim();

async function allApps() {
  return list("pulse_apps", "?perPage=200&sort=sort,name");
}

async function resolveApp(ref, apps) {
  const wanted = normalize(ref);
  const exact = apps.filter((a) => a.id === ref || a.slug === ref || normalize(a.name) === wanted || normalize(a.slug) === wanted);
  if (exact.length === 1) return exact[0];
  const partial = apps.filter((a) => normalize(a.name).includes(wanted));
  if (partial.length === 1) return partial[0];
  const names = apps.map((a) => a.name).join(", ");
  if (partial.length > 1) throw new Error(`« ${ref} » correspond à plusieurs applications : ${partial.map((a) => a.name).join(", ")}.`);
  throw new Error(`Application « ${ref} » introuvable. Applications existantes : ${names || "aucune"}.`);
}

async function resolveApps(refs = []) {
  if (!refs.length) return [];
  const apps = await allApps();
  const found = [];
  for (const ref of refs) found.push(await resolveApp(ref, apps));
  return found;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "nexora-pulse", version: "0.1.0" });

/** Turns a handler result (or error) into an MCP answer. */
const tool = (handler) => async (args) => {
  try {
    return { content: [{ type: "text", text: await handler(args ?? {}) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Erreur : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
};

const visibility = (draft, at) => (draft ? "enregistrée en brouillon (invisible pour le public)" : new Date(at.replace(" ", "T")) > new Date() ? `programmée pour le ${at} UTC` : "publiée, visible tout de suite dans Nexora Pulse");

server.registerTool(
  "pulse_list_apps",
  {
    title: "Lister les applications Nexora",
    description: "Liste les applications de l'écosystème Nexora connues de Nexora Pulse, avec leur état. À appeler pour connaître le nom exact d'une application.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  tool(async () => {
    const apps = await allApps();
    if (!apps.length) return "Aucune application dans Nexora Pulse.";
    return apps
      .map((a) => `- ${a.name} (id ${a.id}) : ${STATUS_LABEL[a.status] ?? a.status}${a.status_message ? `, « ${a.status_message} »` : ""}${a.visible ? "" : " [masquée]"}`)
      .join("\n");
  }),
);

server.registerTool(
  "pulse_create_announcement",
  {
    title: "Publier une annonce",
    description:
      "Publie une annonce dans Nexora Pulse (nouveauté, actualité, événement ou maintenance). Elle est visible par tous les utilisateurs et déclenche une notification Windows, sauf si draft vaut true. Le contenu est en Markdown.",
    inputSchema: {
      title: z.string().min(1).max(160).describe("Titre de l'annonce"),
      summary: z.string().max(320).optional().describe("Une phrase de résumé, affichée dans les listes"),
      body: z.string().max(100000).optional().describe("Contenu complet en Markdown"),
      kind: z.enum(["announcement", "news", "event", "maintenance"]).default("announcement").describe("announcement = annonce, news = actualité, event = événement, maintenance = maintenance"),
      apps: z.array(z.string()).optional().describe("Applications concernées, par nom (ex. « Nexora Music ») ou par id"),
      pinned: z.boolean().optional().describe("Épingler en tête de la page Aujourd'hui"),
      publish_at: z.string().optional().describe("Date de publication ISO 8601. Une date future programme l'annonce. Par défaut : maintenant"),
      cover_path: z.string().optional().describe("Chemin complet d'une image locale (PNG, JPEG ou WebP, 5 Mo max) utilisée comme couverture. Sans image, l'annonce s'affiche sans bloc coloré"),
      draft: z.boolean().optional().describe("true pour enregistrer en brouillon sans publier"),
    },
  },
  tool(async ({ title, summary = "", body = "", kind = "announcement", apps = [], pinned = false, publish_at, cover_path, draft = false }) => {
    const linked = await resolveApps(apps);
    const at = pbDate(publish_at);
    const record = await pb("POST", records("pulse_posts"), {
      title,
      summary,
      body,
      kind,
      apps: linked.map((a) => a.id),
      pinned,
      state: draft ? "draft" : "published",
      publish_at: at,
    });
    if (cover_path) {
      try {
        await uploadCover(record.id, cover_path);
      } catch (error) {
        return `Annonce « ${title} » ${visibility(draft, at)} (id ${record.id}), mais sans image : ${error.message}`;
      }
    }
    return `Annonce « ${title} » ${visibility(draft, at)}${cover_path ? ", avec sa couverture" : ""}. Id : ${record.id}.`;
  }),
);

server.registerTool(
  "pulse_set_cover",
  {
    title: "Ajouter une image de couverture à une annonce",
    description: "Ajoute ou remplace l'image de couverture d'une annonce existante, à partir d'un fichier image local. Utilise pulse_list_recent pour trouver l'id.",
    inputSchema: {
      announcement_id: z.string().min(1).describe("Id de l'annonce"),
      image_path: z.string().min(1).describe("Chemin complet d'une image locale (PNG, JPEG ou WebP, 5 Mo max)"),
    },
  },
  tool(async ({ announcement_id, image_path }) => {
    await uploadCover(announcement_id, image_path);
    return "Couverture ajoutée à l'annonce.";
  }),
);

server.registerTool(
  "pulse_create_update",
  {
    title: "Publier une mise à jour",
    description:
      "Publie une mise à jour d'une application Nexora dans Nexora Pulse, avec son numéro de version et ses notes en Markdown. Elle est visible par tous et déclenche une notification, sauf si draft vaut true.",
    inputSchema: {
      app: z.string().min(1).describe("Application concernée, par nom (ex. « Nexora Music ») ou par id"),
      version: z.string().min(1).max(40).describe("Numéro de version, ex. 1.2.0"),
      title: z.string().max(160).optional().describe("Titre court de la mise à jour"),
      notes: z.string().max(100000).optional().describe("Notes de version en Markdown (liste des changements)"),
      released_at: z.string().optional().describe("Date de sortie ISO 8601. Une date future programme la mise à jour. Par défaut : maintenant"),
      draft: z.boolean().optional().describe("true pour enregistrer en brouillon sans publier"),
    },
  },
  tool(async ({ app, version, title = "", notes = "", released_at, draft = false }) => {
    const target = await resolveApp(app, await allApps());
    const at = pbDate(released_at);
    const record = await pb("POST", records("pulse_releases"), {
      app: target.id,
      version,
      title,
      notes,
      channel: "stable",
      state: draft ? "draft" : "published",
      released_at: at,
    });
    return `Mise à jour ${target.name} ${version} ${visibility(draft, at)}. Id : ${record.id}.`;
  }),
);

server.registerTool(
  "pulse_set_app_status",
  {
    title: "Changer l'état d'une application",
    description: "Change l'état affiché d'une application Nexora (opérationnel, maintenance, panne...). Visible tout de suite par tous les utilisateurs.",
    inputSchema: {
      app: z.string().min(1).describe("Application, par nom ou par id"),
      status: z.enum(["operational", "degraded", "partial_outage", "major_outage", "maintenance", "unknown"]).describe("Nouvel état"),
      message: z.string().max(280).optional().describe("Message court affiché sous l'état. Vide pour l'effacer"),
    },
  },
  tool(async ({ app, status, message = "" }) => {
    const target = await resolveApp(app, await allApps());
    await pb("PATCH", records("pulse_apps", `/${target.id}`), { status, status_message: message });
    return `${target.name} est maintenant « ${STATUS_LABEL[status]} »${message ? ` : ${message}` : ""}.`;
  }),
);

server.registerTool(
  "pulse_open_incident",
  {
    title: "Déclarer un incident",
    description: "Déclare un incident en cours sur une ou plusieurs applications Nexora, avec un premier message. Visible tout de suite et notifié aux utilisateurs.",
    inputSchema: {
      title: z.string().min(1).max(160).describe("Titre de l'incident"),
      severity: z.enum(["minor", "major", "critical"]).describe("minor = mineur, major = majeur, critical = critique"),
      apps: z.array(z.string()).optional().describe("Applications touchées, par nom ou par id"),
      message: z.string().min(1).max(2000).describe("Premier message : ce qui se passe"),
    },
  },
  tool(async ({ title, severity, apps = [], message }) => {
    const linked = await resolveApps(apps);
    const incident = await pb("POST", records("pulse_incidents"), {
      title,
      severity,
      phase: "investigating",
      apps: linked.map((a) => a.id),
      started_at: pbDate(),
    });
    await pb("POST", records("pulse_incident_updates"), { incident: incident.id, phase: "investigating", message });
    return `Incident « ${title} » ouvert. Id : ${incident.id}.`;
  }),
);

server.registerTool(
  "pulse_update_incident",
  {
    title: "Faire avancer un incident",
    description: "Ajoute un message à un incident et change son étape. L'étape resolved le marque comme résolu. Utilise pulse_list_recent pour trouver l'id.",
    inputSchema: {
      incident_id: z.string().min(1).describe("Id de l'incident"),
      phase: z.enum(["investigating", "identified", "monitoring", "resolved"]).describe("investigating = analyse, identified = cause trouvée, monitoring = sous surveillance, resolved = résolu"),
      message: z.string().min(1).max(2000).describe("Message de suivi"),
    },
  },
  tool(async ({ incident_id, phase, message }) => {
    await pb("POST", records("pulse_incident_updates"), { incident: incident_id, phase, message });
    await pb("PATCH", records("pulse_incidents", `/${incident_id}`), { phase, resolved_at: phase === "resolved" ? pbDate() : "" });
    return phase === "resolved" ? "Incident marqué comme résolu." : "Incident mis à jour.";
  }),
);

server.registerTool(
  "pulse_list_recent",
  {
    title: "Voir les derniers contenus",
    description: "Liste les dernières annonces, mises à jour et incidents de Nexora Pulse avec leurs ids, y compris les brouillons. Utile avant de modifier ou supprimer quelque chose.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(10).describe("Nombre d'éléments par catégorie") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ limit = 10 }) => {
    const [posts, releases, incidents, apps] = await Promise.all([
      list("pulse_posts", `?perPage=${limit}&sort=-publish_at`),
      list("pulse_releases", `?perPage=${limit}&sort=-released_at`),
      list("pulse_incidents", `?perPage=${limit}&sort=-started_at`),
      allApps(),
    ]);
    const name = (id) => apps.find((a) => a.id === id)?.name ?? "?";
    const state = (r, at) => (r.state === "draft" ? "brouillon" : new Date(at.replace(" ", "T")) > new Date() ? "programmé" : "publié");
    return [
      "Annonces :",
      ...(posts.length ? posts.map((p) => `- [${p.id}] ${p.title} (${state(p, p.publish_at)}, ${p.publish_at.slice(0, 10)})`) : ["- aucune"]),
      "",
      "Mises à jour :",
      ...(releases.length ? releases.map((r) => `- [${r.id}] ${name(r.app)} ${r.version}${r.title ? ` : ${r.title}` : ""} (${state(r, r.released_at)}, ${r.released_at.slice(0, 10)})`) : ["- aucune"]),
      "",
      "Incidents :",
      ...(incidents.length ? incidents.map((i) => `- [${i.id}] ${i.title} (${i.severity}, ${i.phase})`) : ["- aucun"]),
    ].join("\n");
  }),
);

server.registerTool(
  "pulse_delete",
  {
    title: "Supprimer une annonce, une mise à jour ou un incident",
    description: "Supprime définitivement un élément de Nexora Pulse. Irréversible : confirme avec l'utilisateur avant de l'appeler. Utilise pulse_list_recent pour trouver l'id.",
    inputSchema: {
      type: z.enum(["announcement", "update", "incident"]).describe("Type d'élément"),
      id: z.string().min(1).describe("Id de l'élément"),
    },
    annotations: { destructiveHint: true },
  },
  tool(async ({ type, id }) => {
    const collection = { announcement: "pulse_posts", update: "pulse_releases", incident: "pulse_incidents" }[type];
    await pb("DELETE", records(collection, `/${id}`));
    return "Élément supprimé.";
  }),
);

await server.connect(new StdioServerTransport());
console.error(`Nexora Pulse MCP prêt (${BASE}).`);
