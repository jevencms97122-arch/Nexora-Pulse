// Typed wrappers over the Rust commands. In a plain browser (`npm run dev`)
// the interface runs on clearly labelled demo data and never touches the server.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppInfo,
  AppInput,
  CoverInput,
  Editor,
  IncidentInput,
  Phase,
  PostInput,
  Prefs,
  ReleaseInput,
  Snapshot,
  UpdateInfo,
} from "./types";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(command, args);
  const { demoCall } = await import("./demo");
  return demoCall(command, args) as T;
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  windowReady: () => call<void>("window_ready"),
  openLink: (url: string) => (inTauri ? call<void>("open_link", { url }) : Promise.resolve(void window.open(url, "_blank"))),
  snapshot: () => call<Snapshot>("snapshot"),
  refresh: () => call<Snapshot>("refresh_now"),
  session: () => call<Editor | null>("session"),
  login: (email: string, password: string) => call<Editor>("login", { email, password }),
  logout: () => call<void>("logout"),
  getPrefs: () => call<Prefs>("get_prefs"),
  setPrefs: (prefs: Prefs) => call<Prefs>("set_prefs", { prefs }),
  savePost: (input: PostInput, cover: CoverInput | null) => call<Snapshot>("save_post", { input, cover }),
  saveRelease: (input: ReleaseInput) => call<Snapshot>("save_release", { input }),
  saveApp: (input: AppInput) => call<Snapshot>("save_app", { input }),
  importStoreApps: () => call<Snapshot>("import_store_apps"),
  openIncident: (input: IncidentInput) => call<Snapshot>("open_incident", { input }),
  updateIncident: (id: string, phase: Phase, message: string) => call<Snapshot>("update_incident", { id, phase, message }),
  deleteRecord: (collection: "pulse_posts" | "pulse_releases" | "pulse_incidents", id: string) =>
    call<Snapshot>("delete_record", { collection, id }),
  deleteApp: (id: string) => call<Snapshot>("delete_app", { id }),
  renderMarkdown: (text: string) => call<string>("render_markdown", { text }),
  updateStatus: () => call<UpdateInfo | null>("update_status"),
  updateCheck: () => call<void>("update_check"),
  updateInstall: () => call<boolean>("update_install"),
};

export function onEvent<T>(name: string, handler: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  const off = listen<T>(name, (event) => handler(event.payload));
  return () => void off.then((stop) => stop());
}

export const errorText = (error: unknown) => (typeof error === "string" ? error : error instanceof Error ? error.message : "Une erreur est survenue.");
