import type { AppStatus, Incident, Phase, Post, PostKind, PulseApp, Release, Severity } from "./types";

export const parseDate = (value: string) => {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const todayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const relativeFormat = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export const formatDay = (value: string) => {
  const date = parseDate(value);
  return date ? dayFormat.format(date) : "";
};

export const formatTime = (value: string) => {
  const date = parseDate(value);
  return date ? timeFormat.format(date) : "";
};

export const formatMonth = (value: string) => {
  const date = parseDate(value);
  if (!date) return "";
  const text = monthFormat.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatToday = () => {
  const text = todayFormat.format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatRelative = (value: string) => {
  const date = parseDate(value);
  if (!date) return "";
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return "à l'instant";
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 14) return relativeFormat.format(days, "day");
  return formatDay(value);
};

export const isFuture = (value: string) => {
  const date = parseDate(value);
  return !!date && date.getTime() > Date.now();
};

/** Value for a `datetime-local` input, in the user's time zone. */
export const toLocalInput = (value: string) => {
  const date = parseDate(value) ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInput = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const STATUS_META: Record<AppStatus, { label: string; color: string; rank: number }> = {
  major_outage: { label: "Panne majeure", color: "var(--red)", rank: 5 },
  partial_outage: { label: "Panne partielle", color: "var(--orange)", rank: 4 },
  degraded: { label: "Performances dégradées", color: "var(--yellow)", rank: 3 },
  maintenance: { label: "Maintenance", color: "var(--blue)", rank: 2 },
  operational: { label: "Opérationnel", color: "var(--green)", rank: 1 },
  unknown: { label: "Non renseigné", color: "var(--gray)", rank: 0 },
};

export const STATUS_ORDER: AppStatus[] = ["operational", "degraded", "partial_outage", "major_outage", "maintenance", "unknown"];

export const KIND_META: Record<PostKind, { label: string; plural: string; color: string }> = {
  announcement: { label: "Annonce", plural: "Annonces", color: "var(--accent)" },
  news: { label: "Actualité", plural: "Actualités", color: "var(--green)" },
  event: { label: "Événement", plural: "Événements", color: "#a855f7" },
  maintenance: { label: "Maintenance", plural: "Maintenances", color: "var(--orange)" },
};

export const SEVERITY_META: Record<Severity, { label: string; color: string; rank: number }> = {
  minor: { label: "Mineur", color: "var(--yellow)", rank: 1 },
  major: { label: "Majeur", color: "var(--orange)", rank: 2 },
  critical: { label: "Critique", color: "var(--red)", rank: 3 },
};

export const PHASE_LABEL: Record<Phase, string> = {
  investigating: "Analyse en cours",
  identified: "Cause identifiée",
  monitoring: "Sous surveillance",
  resolved: "Résolu",
};

export interface Overall {
  title: string;
  detail: string;
  color: string;
}

export function overallStatus(apps: PulseApp[], incidents: Incident[]): Overall {
  const open = incidents.filter((i) => i.phase !== "resolved");
  const known = apps.filter((a) => a.status !== "unknown");
  const worst = known.reduce<AppStatus>(
    (acc, a) => (STATUS_META[a.status].rank > STATUS_META[acc].rank ? a.status : acc),
    "unknown",
  );
  if (open.length > 0) {
    const severe = open.reduce((acc, i) => Math.max(acc, SEVERITY_META[i.severity].rank), 0);
    return {
      title: open.length > 1 ? `${open.length} incidents en cours` : "Un incident en cours",
      detail: "L'équipe Nexora s'en occupe.",
      color: severe >= 3 ? "var(--red)" : severe === 2 ? "var(--orange)" : "var(--yellow)",
    };
  }
  if (apps.length === 0 || known.length === 0) {
    return { title: "État non renseigné", detail: "Aucun état n'a encore été publié.", color: "var(--gray)" };
  }
  if (worst === "operational") {
    const partial = known.length < apps.length;
    return {
      title: partial ? "Aucun problème signalé" : "Tout fonctionne normalement",
      detail: partial ? `${known.length} applications sur ${apps.length} renseignées.` : "Toutes les applications sont opérationnelles.",
      color: "var(--green)",
    };
  }
  if (worst === "maintenance") {
    return { title: "Maintenance en cours", detail: "Certaines applications sont en maintenance.", color: "var(--blue)" };
  }
  return { title: "Perturbations en cours", detail: "Certaines applications rencontrent un problème.", color: STATUS_META[worst].color };
}

export const postIsLive = (post: Post) => post.state === "published" && !isFuture(post.publish_at);
export const releaseIsLive = (release: Release) => release.state === "published" && !isFuture(release.released_at);

export const publishLabel = (state: string, at: string) => {
  if (state === "draft") return "Brouillon";
  return isFuture(at) ? `Programmé · ${formatTime(at)}` : "Publié";
};
