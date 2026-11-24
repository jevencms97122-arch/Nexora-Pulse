// Fake content for `npm run dev` in a browser only. It never reaches the server.

import type { Editor, Incident, Post, Prefs, PulseApp, Release, Snapshot, UpdateInfo } from "./types";

const daysAgo = (days: number, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString().replace("T", " ");

const app = (id: string, name: string, tagline: string, accent: string, version: string, status: PulseApp["status"], sort: number, status_message = ""): PulseApp => ({
  id,
  slug: id,
  name,
  tagline,
  accent,
  store_id: "",
  status,
  status_message,
  sort,
  visible: true,
  updated: daysAgo(0),
  version,
  icon_url: "",
});

const apps: PulseApp[] = [
  app("craft", "Nexora Craft", "Le lanceur Minecraft de l'écosystème", "#34c759", "0.1.6", "operational", 10),
  app("corsa", "Nexora Corsa", "Courses et serveurs Assetto Corsa", "#ff375f", "0.1.1", "operational", 20),
  app("music", "Nexora Music", "Toute ta musique, au même endroit", "#bf5af2", "1.0.1", "degraded", 30, "Lecture ralentie sur certains titres"),
  app("chat", "Nexora Chat", "Discute avec toute la communauté", "#0a84ff", "1.1.1", "operational", 40),
  app("convert", "Nexora Convert", "Convertis tous tes fichiers", "#ff9f0a", "1.0", "operational", 50),
  app("tools", "Nexora Tools", "La boîte à outils du quotidien", "#30b0c7", "1.0.1", "maintenance", 60, "Maintenance du serveur vocal"),
  app("store", "Nexora Store", "Installe toutes les applis Nexora", "#5e5ce6", "0.1.3", "operational", 70),
];

const post = (id: string, title: string, summary: string, kind: Post["kind"], appIds: string[], days: number, pinned = false, state: Post["state"] = "published"): Post => {
  const body = `${summary}\n\nCeci est un **contenu de démonstration** affiché uniquement dans le navigateur.`;
  return {
    id,
    title,
    summary,
    body,
    kind,
    apps: appIds,
    pinned,
    state,
    publish_at: daysAgo(days),
    cover: "",
    created: daysAgo(days),
    updated: daysAgo(days),
    html: `<p>${summary}</p><p>Ceci est un <strong>contenu de démonstration</strong> affiché uniquement dans le navigateur.</p>`,
    cover_url: "",
  };
};

const release = (id: string, appId: string, version: string, title: string, days: number, channel: Release["channel"] = "stable"): Release => ({
  id,
  app: appId,
  version,
  title,
  notes: "- Améliorations de stabilité\n- Interface plus fluide",
  channel,
  state: "published",
  released_at: daysAgo(days),
  created: daysAgo(days),
  updated: daysAgo(days),
  html: "<ul><li>Améliorations de stabilité</li><li>Interface plus fluide</li></ul>",
});

const incidents: Incident[] = [
  {
    id: "i1",
    title: "Lecture ralentie sur Nexora Music",
    severity: "minor",
    phase: "monitoring",
    apps: ["music"],
    started_at: daysAgo(0, 5),
    resolved_at: "",
    created: daysAgo(0, 5),
    updated: daysAgo(0, 1),
    updates: [
      { id: "u1", incident: "i1", phase: "investigating", message: "Nous analysons des lenteurs de lecture.", created: daysAgo(0, 5) },
      { id: "u2", incident: "i1", phase: "monitoring", message: "Un correctif est déployé, nous surveillons la situation.", created: daysAgo(0, 1) },
    ],
  },
  {
    id: "i2",
    title: "Connexion impossible à Nexora Chat",
    severity: "major",
    phase: "resolved",
    apps: ["chat"],
    started_at: daysAgo(18, 3),
    resolved_at: daysAgo(18, 1),
    created: daysAgo(18, 3),
    updated: daysAgo(18, 1),
    updates: [{ id: "u3", incident: "i2", phase: "resolved", message: "Le service est rétabli.", created: daysAgo(18, 1) }],
  },
];

let snapshot: Snapshot = {
  apps,
  posts: [
    post("p1", "Bienvenue sur Nexora Pulse", "Toutes les annonces, les mises à jour et l'état de l'écosystème Nexora, réunis au même endroit.", "announcement", [], 0, true),
    post("p2", "Nexora Chat passe en 1.1", "Une messagerie plus rapide, de nouveaux salons et des notifications repensées.", "news", ["chat"], 1),
    post("p3", "Soirée communauté sur Nexora Craft", "Retrouve toute l'équipe samedi soir pour un événement sur le serveur.", "event", ["craft"], 3),
    post("p4", "Maintenance du serveur vocal", "Nexora Tools sera partiellement indisponible pendant l'intervention.", "maintenance", ["tools"], 4),
    post("p5", "Brouillon : la feuille de route", "Ce que prépare l'équipe pour les prochains mois.", "announcement", [], 0, false, "draft"),
  ],
  releases: [
    release("r1", "tools", "1.0.1", "Corrections du relais vocal", 0),
    release("r2", "chat", "1.1.1", "Notifications plus fiables", 1),
    release("r3", "convert", "1.0", "Première version stable", 2),
    release("r4", "music", "1.0.1", "Lecture plus stable", 2),
    release("r5", "craft", "0.1.6", "Nouveau lanceur", 2, "beta"),
  ],
  incidents,
  online: true,
  live: true,
  setup_required: false,
  fetched_at: daysAgo(0),
};

let editor: Editor | null = null;
let prefs: Prefs = { notifications: true, muted_apps: [], close_to_tray: true, autostart: false };
const update: UpdateInfo = { phase: "dev", current: __APP_VERSION__, version: null, notes: null, progress: 0, error: null };

const uid = () => Math.random().toString(36).slice(2, 12);
const plainHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");

export function demoCall(command: string, args: Record<string, any> = {}): unknown {
  const now = new Date().toISOString().replace("T", " ");
  const input = args.input ?? {};
  switch (command) {
    case "app_info":
      return { version: __APP_VERSION__, mica: false, server: "Démo locale", secure: false };
    case "window_ready":
      return undefined;
    case "snapshot":
    case "refresh_now":
      return snapshot;
    case "session":
      return editor;
    case "login":
      if (!args.email || !args.password) throw new Error("Renseigne ton e-mail et ton mot de passe.");
      editor = { id: "demo", email: args.email, name: "Démo" };
      return editor;
    case "logout":
      editor = null;
      return undefined;
    case "get_prefs":
      return prefs;
    case "set_prefs":
      prefs = args.prefs;
      return prefs;
    case "update_status":
      return update;
    case "update_check":
      return undefined;
    case "update_install":
      return false;
    case "render_markdown":
      return plainHtml(args.text ?? "");
    case "save_post": {
      const existing = snapshot.posts.find((p) => p.id === input.id);
      const next: Post = { ...(existing ?? post(uid(), "", "", "announcement", [], 0)), ...input, id: input.id || uid(), publish_at: (input.publish_at || now).replace("T", " "), html: plainHtml(input.body), updated: now };
      snapshot = { ...snapshot, posts: [next, ...snapshot.posts.filter((p) => p.id !== next.id)] };
      return snapshot;
    }
    case "save_release": {
      const next: Release = { ...release(input.id || uid(), input.app, input.version, input.title, 0), ...input, id: input.id || uid(), released_at: (input.released_at || now).replace("T", " "), html: plainHtml(input.notes) };
      snapshot = { ...snapshot, releases: [next, ...snapshot.releases.filter((r) => r.id !== next.id)] };
      return snapshot;
    }
    case "save_app": {
      const existing = snapshot.apps.find((a) => a.id === input.id);
      const next: PulseApp = { ...(existing ?? app(uid(), "", "", "#0a84ff", "", "unknown", 100)), ...input, id: input.id || uid() };
      snapshot = { ...snapshot, apps: existing ? snapshot.apps.map((a) => (a.id === next.id ? next : a)) : [...snapshot.apps, next] };
      return snapshot;
    }
    case "import_store_apps":
      return snapshot;
    case "open_incident": {
      const id = uid();
      const next: Incident = { id, title: input.title, severity: input.severity, phase: "investigating", apps: input.apps, started_at: now, resolved_at: "", created: now, updated: now, updates: [{ id: uid(), incident: id, phase: "investigating", message: input.message, created: now }] };
      snapshot = { ...snapshot, incidents: [next, ...snapshot.incidents] };
      return snapshot;
    }
    case "update_incident": {
      snapshot = {
        ...snapshot,
        incidents: snapshot.incidents.map((i) =>
          i.id === args.id
            ? { ...i, phase: args.phase, resolved_at: args.phase === "resolved" ? now : "", updates: [...i.updates, { id: uid(), incident: i.id, phase: args.phase, message: args.message, created: now }] }
            : i,
        ),
      };
      return snapshot;
    }
    case "delete_app":
      snapshot = { ...snapshot, apps: snapshot.apps.filter((a) => a.id !== args.id), releases: snapshot.releases.filter((r) => r.app !== args.id) };
      return snapshot;
    case "delete_record": {
      const key = args.collection === "pulse_posts" ? "posts" : args.collection === "pulse_releases" ? "releases" : "incidents";
      snapshot = { ...snapshot, [key]: (snapshot[key] as { id: string }[]).filter((r) => r.id !== args.id) };
      return snapshot;
    }
    default:
      throw new Error(`Commande inconnue : ${command}`);
  }
}
