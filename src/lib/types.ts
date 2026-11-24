export type AppStatus = "unknown" | "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
export type PostKind = "announcement" | "news" | "event" | "maintenance";
export type PublishState = "draft" | "published";
export type Channel = "stable" | "beta";
export type Severity = "minor" | "major" | "critical";
export type Phase = "investigating" | "identified" | "monitoring" | "resolved";

export interface PulseApp {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  accent: string;
  store_id: string;
  status: AppStatus;
  status_message: string;
  sort: number;
  visible: boolean;
  updated: string;
  check_kind: CheckKind;
  check_target: string;
  check_ok: boolean;
  check_latency: number;
  checked_at: string;
  version: string;
  icon_url: string;
}

export type CheckKind = "none" | "http" | "tcp";

/** Checks counted for one app on one UTC day, written by pulse-monitor. */
export interface UptimeDay {
  app: string;
  day: string;
  ok: number;
  total: number;
  latency_sum: number;
}

export interface Post {
  id: string;
  title: string;
  summary: string;
  body: string;
  kind: PostKind;
  apps: string[];
  pinned: boolean;
  state: PublishState;
  publish_at: string;
  cover: string;
  created: string;
  updated: string;
  html: string;
  cover_url: string;
}

export interface Release {
  id: string;
  app: string;
  version: string;
  title: string;
  notes: string;
  channel: Channel;
  state: PublishState;
  released_at: string;
  created: string;
  updated: string;
  html: string;
}

export interface IncidentUpdate {
  id: string;
  incident: string;
  phase: Phase;
  message: string;
  created: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  phase: Phase;
  apps: string[];
  started_at: string;
  resolved_at: string;
  created: string;
  updated: string;
  updates: IncidentUpdate[];
}

export interface Snapshot {
  apps: PulseApp[];
  uptime: UptimeDay[];
  posts: Post[];
  releases: Release[];
  incidents: Incident[];
  online: boolean;
  live: boolean;
  setup_required: boolean;
  fetched_at: string;
}

export interface Editor {
  id: string;
  email: string;
  name: string;
}

export interface Prefs {
  notifications: boolean;
  muted_apps: string[];
  close_to_tray: boolean;
  autostart: boolean;
}

export interface AppInfo {
  version: string;
  mica: boolean;
  server: string;
  secure: boolean;
}

export type UpdatePhase = "idle" | "dev" | "checking" | "uptodate" | "downloading" | "ready" | "installing" | "error";

export interface UpdateInfo {
  phase: UpdatePhase;
  current: string;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
}

export interface PostInput {
  id?: string;
  title: string;
  summary: string;
  body: string;
  kind: PostKind;
  apps: string[];
  pinned: boolean;
  state: PublishState;
  publish_at: string;
  remove_cover?: boolean;
}

export interface CoverInput {
  name: string;
  data: string;
}

export interface ReleaseInput {
  id?: string;
  app: string;
  version: string;
  title: string;
  notes: string;
  channel: Channel;
  state: PublishState;
  released_at: string;
}

export interface AppInput {
  id?: string;
  name: string;
  tagline: string;
  accent: string;
  store_id: string;
  status: AppStatus;
  status_message: string;
  sort: number;
  visible: boolean;
  check_kind: CheckKind;
  check_target: string;
}

/** Live response time of one app, measured when the status page opens. */
export interface Ping {
  app: string;
  ok: boolean;
  latency_ms: number;
}

export interface CheckResult {
  ok: boolean;
  latency_ms: number;
  detail: string;
}

export interface IncidentInput {
  title: string;
  severity: Severity;
  apps: string[];
  message: string;
}

export type Page = "today" | "posts" | "releases" | "apps" | "settings" | "studio";
