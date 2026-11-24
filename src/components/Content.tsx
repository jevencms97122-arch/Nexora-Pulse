import { ChevronRight, Pin, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { KIND_META, PHASE_LABEL, SEVERITY_META, STATUS_META, formatDay, formatRelative, formatTime, parseDate } from "../lib/format";
import type { Incident, Ping, Post, PostKind, PulseApp, Release } from "../lib/types";
import { usePulse } from "../state/pulse";
import { AppIcon } from "./AppIcon";
import { Sheet, StatusDot, softSpring } from "./ui";

/** Post type as quiet text: color is kept for states, not for categories. */
export function KindBadge({ kind }: { kind: PostKind }) {
  return <span className="text-[12px] font-medium text-muted">{KIND_META[kind].label}</span>;
}

/** The cover image of a post. Posts without an image have no cover block at all. */
function coverStyle(post: Post) {
  return { backgroundImage: `url("${post.cover_url}")`, backgroundSize: "cover", backgroundPosition: "center" };
}

export function HeroPost({ post }: { post: Post }) {
  const { openPost } = usePulse();
  const meta = (
    <>
      {post.pinned && <Pin size={11} className="fill-current" />}
      {KIND_META[post.kind].label} · {formatRelative(post.publish_at)}
    </>
  );

  if (!post.cover_url) {
    return (
      <button onClick={() => openPost(post.id)} className="card flex w-full flex-col p-8 text-left transition-colors hover:bg-surface-2/60">
        <span className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted">{meta}</span>
        <span className="t-large max-w-2xl !text-[30px]">{post.title}</span>
        {post.summary && <span className="line-clamp-3 mt-2.5 max-w-xl text-[15px] leading-snug text-muted">{post.summary}</span>}
      </button>
    );
  }

  return (
    <button
      onClick={() => openPost(post.id)}
      className="squircle relative flex h-[300px] w-full flex-col justify-end overflow-hidden rounded-[24px] p-8 text-left text-white transition-opacity hover:opacity-95"
      style={coverStyle(post)}
    >
      <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <span className="relative mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-white/80">{meta}</span>
      <span className="t-large relative max-w-2xl !text-[32px]">{post.title}</span>
      {post.summary && <span className="line-clamp-2 relative mt-2 max-w-xl text-[15px] leading-snug text-white/80">{post.summary}</span>}
    </button>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { openPost, appById } = usePulse();
  const related = post.apps.map(appById).filter(Boolean) as PulseApp[];
  return (
    <button onClick={() => openPost(post.id)} className="card group flex h-full w-full flex-col overflow-hidden text-left">
      {post.cover_url && (
        <span className="relative block h-[140px] w-full shrink-0 transition-opacity group-hover:opacity-90" style={coverStyle(post)} />
      )}
      <span className="flex flex-1 flex-col p-4">
        <span className="mb-1 flex items-center gap-1.5">
          {post.pinned && <Pin size={11} className="shrink-0 fill-current text-muted" />}
          <KindBadge kind={post.kind} />
          <span className="text-[12px] text-faint">· {formatRelative(post.publish_at)}</span>
        </span>
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold">{post.title}</span>
        {post.summary && <span className="line-clamp-3 mt-1 text-[13px] text-muted">{post.summary}</span>}
        {related.length > 0 && <span className="mt-auto truncate pt-3 text-[12px] text-faint">{related.map((a) => a.name).join(", ")}</span>}
      </span>
    </button>
  );
}

/** A post as one line of a list. */
export function PostRow({ post }: { post: Post }) {
  const { openPost } = usePulse();
  return (
    <button onClick={() => openPost(post.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{post.title}</span>
        {post.summary && <span className="block truncate text-[13px] text-muted">{post.summary}</span>}
      </span>
      <span className="shrink-0 text-[12px] text-faint">{formatRelative(post.publish_at)}</span>
      <ChevronRight size={15} className="shrink-0 text-faint" />
    </button>
  );
}

/** Rendered Markdown. The HTML is sanitized by the Rust side before it gets here. */
export function RichText({ html, compact = false }: { html: string; compact?: boolean }) {
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href) void api.openLink(href);
  };
  return <div onClick={onClick} className={`prose-pulse ${compact ? "prose-compact" : ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ArticleSheet() {
  const { postId, openPost, snapshot, appById, go } = usePulse();
  const [last, setLast] = useState<Post | null>(null);
  const post = useMemo(() => snapshot.posts.find((p) => p.id === postId) ?? null, [snapshot.posts, postId]);
  useEffect(() => {
    if (post) setLast(post);
  }, [post]);
  const shown = post ?? last;
  const related = (shown?.apps.map(appById).filter(Boolean) ?? []) as PulseApp[];

  return (
    <Sheet open={!!post} onClose={() => openPost(null)} width={720}>
      {shown && (
        <article>
          {shown.cover_url ? (
            <div className="relative h-[240px]" style={coverStyle(shown)}>
              <CloseButton onClick={() => openPost(null)} />
            </div>
          ) : (
            <div className="relative h-14">
              <CloseButton onClick={() => openPost(null)} />
            </div>
          )}
          <div className="px-10 pt-8 pb-10">
            <p className="mb-2 text-[12.5px] font-medium text-muted">
              {KIND_META[shown.kind].label} · {formatDay(shown.publish_at)}
            </p>
            <h1 className="t-large !text-[30px]">{shown.title}</h1>
            {shown.summary && <p className="mt-3 mb-6 text-[17px] leading-snug text-muted">{shown.summary}</p>}
            <RichText html={shown.html} />
            {related.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
                {related.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => {
                      openPost(null);
                      go("apps", app.id);
                    }}
                    className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3.5 pl-1 text-[13px] font-medium transition hover:bg-surface-3"
                  >
                    <AppIcon app={app} size={24} /> {app.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </article>
      )}
    </Sheet>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button aria-label="Fermer" onClick={onClick} className="glass absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full text-fg">
      <X size={15} strokeWidth={2.4} />
    </button>
  );
}

export function ReleaseRow({ release, open, onToggle }: { release: Release; open: boolean; onToggle: () => void }) {
  const { appById } = usePulse();
  const app = appById(release.app);
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60">
        <AppIcon app={app} size={34} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium">{app?.name ?? "Application"}</span>
            <span className="text-[13px] text-muted tabular-nums">{release.version}</span>
          </span>
          {release.title && <span className="block truncate text-[13px] text-muted">{release.title}</span>}
        </span>
        <span className="shrink-0 text-[12px] text-faint">{formatRelative(release.released_at)}</span>
      </button>
      {open && release.html && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={softSpring} className="overflow-hidden">
          <div className="pr-5 pb-4 pl-[68px]">
            <RichText html={release.html} compact />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const { appById } = usePulse();
  const severity = SEVERITY_META[incident.severity];
  const resolved = incident.phase === "resolved";
  const names = incident.apps.map((id) => appById(id)?.name).filter(Boolean).join(", ");
  const latest = incident.updates.at(-1);
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-[7px]">
          <StatusDot color={resolved ? "var(--green)" : severity.color} live={!resolved} size={8} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{incident.title}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {PHASE_LABEL[incident.phase]}
            {names ? ` · ${names}` : ""} · {formatTime(incident.started_at)}
          </p>
          {latest && <p className="selectable mt-2 text-[13.5px]">{latest.message}</p>}
        </div>
      </div>
    </div>
  );
}

export function AppStatusLabel({ app }: { app: PulseApp }) {
  const meta = STATUS_META[app.status] ?? STATUS_META.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: app.status === "unknown" ? "var(--muted)" : meta.color }}>
      <StatusDot color={meta.color} live={app.status !== "operational" && app.status !== "unknown"} size={7} />
      {meta.label}
    </span>
  );
}

/** Response time in ms: the live ping if there is one, else the last value stored by pulse-monitor. */
export function latencyOf(app: PulseApp, pings: Record<string, Ping>): number | null {
  const live = pings[app.id];
  if (live) return live.ok ? live.latency_ms : null;
  const checked = parseDate(app.checked_at);
  const fresh = !!checked && Date.now() - checked.getTime() < 15 * 60 * 1000;
  return app.check_ok && fresh && app.check_latency > 0 ? app.check_latency : null;
}

/** "42 ms". Renders nothing when there is no measure. */
export function LatencyLabel({ app }: { app: PulseApp }) {
  const { pings } = usePulse();
  const value = latencyOf(app, pings);
  if (value === null) return null;
  return (
    <span title="Temps de réponse mesuré à l'instant depuis cet ordinateur" className="text-[13px] text-muted tabular-nums">
      {value.toLocaleString("fr-FR")} ms
    </span>
  );
}

/** One app in a status list: icon, name, response time and state. */
export function AppStatusRow({ app }: { app: PulseApp }) {
  const { go } = usePulse();
  return (
    <button onClick={() => go("apps", app.id)} className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60">
      <AppIcon app={app} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{app.name}</span>
        {app.status_message && <span className="block truncate text-[12.5px] text-muted">{app.status_message}</span>}
      </span>
      <LatencyLabel app={app} />
      <span className="flex w-[180px] justify-end">
        <AppStatusLabel app={app} />
      </span>
    </button>
  );
}

/** A label and its value on one line, as in a settings list. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-4 px-5 py-3">
      <span className="text-[14px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[14px]">{children}</span>
    </div>
  );
}
