import { CalendarDays, Megaphone, Newspaper, Pin, Wrench, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { CHANNEL_LABEL, KIND_META, PHASE_LABEL, SEVERITY_META, STATUS_META, formatDay, formatRelative, formatTime, incidentDays } from "../lib/format";
import type { Incident, Post, PostKind, PulseApp, Release } from "../lib/types";
import { usePulse } from "../state/pulse";
import { AppIcon } from "./AppIcon";
import { Badge, Sheet, StatusDot, softSpring } from "./ui";

const KIND_ICON: Record<PostKind, ReactNode> = {
  announcement: <Megaphone size={13} />,
  news: <Newspaper size={13} />,
  event: <CalendarDays size={13} />,
  maintenance: <Wrench size={13} />,
};

export function KindBadge({ kind }: { kind: PostKind }) {
  return (
    <Badge color={KIND_META[kind].color}>
      {KIND_ICON[kind]} {KIND_META[kind].label}
    </Badge>
  );
}

function coverStyle(post: Post, accent?: string) {
  if (post.cover_url) return { backgroundImage: `url("${post.cover_url}")`, backgroundSize: "cover", backgroundPosition: "center" };
  const color = accent || KIND_META[post.kind].color;
  return {
    background: `radial-gradient(120% 130% at 12% 0%, color-mix(in srgb, ${color} 62%, white) 0%, transparent 56%), radial-gradient(110% 120% at 100% 100%, color-mix(in srgb, ${color} 72%, #2b1a78) 0%, transparent 62%), linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, #0b1b5c))`,
  };
}

export function HeroPost({ post }: { post: Post }) {
  const { openPost, appById } = usePulse();
  const accent = appById(post.apps[0] ?? "")?.accent;
  return (
    <motion.button
      onClick={() => openPost(post.id)}
      whileHover={{ scale: 1.006 }}
      whileTap={{ scale: 0.995 }}
      transition={softSpring}
      className="squircle relative flex h-[340px] w-full flex-col justify-end overflow-hidden rounded-[28px] p-9 text-left text-white shadow-[var(--shadow-hover)]"
      style={coverStyle(post, accent ?? "#2f6bff")}
    >
      <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <span className="relative mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-white/85">
        {post.pinned && <Pin size={12} className="fill-current" />}
        {KIND_META[post.kind].label} · {formatRelative(post.publish_at)}
      </span>
      <span className="t-large relative max-w-3xl !text-[38px]">{post.title}</span>
      {post.summary && <span className="line-clamp-2 relative mt-2.5 max-w-2xl text-[16px] leading-snug text-white/85">{post.summary}</span>}
    </motion.button>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { openPost, appById } = usePulse();
  const related = post.apps.map(appById).filter(Boolean) as PulseApp[];
  return (
    <motion.button
      onClick={() => openPost(post.id)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={softSpring}
      className="card flex h-full w-full flex-col overflow-hidden text-left hover:shadow-[var(--shadow-hover)]"
    >
      <span className="relative block h-[132px] w-full shrink-0" style={coverStyle(post, related[0]?.accent)}>
        {post.pinned && (
          <span className="glass absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full text-fg">
            <Pin size={12} className="fill-current" />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-4.5">
        <span className="mb-2 flex items-center justify-between gap-2">
          <KindBadge kind={post.kind} />
          <span className="truncate text-[12px] text-faint">{formatRelative(post.publish_at)}</span>
        </span>
        <span className="t-headline line-clamp-2">{post.title}</span>
        {post.summary && <span className="line-clamp-2 mt-1 text-[13.5px] text-muted">{post.summary}</span>}
        {related.length > 0 && (
          <span className="mt-auto flex items-center pt-3">
            {related.slice(0, 4).map((app, index) => (
              <span key={app.id} className={index ? "-ml-1.5" : ""}>
                <AppIcon app={app} size={22} />
              </span>
            ))}
            {related.length === 1 && <span className="ml-2 truncate text-[12px] font-medium text-muted">{related[0].name}</span>}
          </span>
        )}
      </span>
    </motion.button>
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
    <Sheet open={!!post} onClose={() => openPost(null)} width={760}>
      {shown && (
        <article>
          <div className="relative flex h-[230px] items-end p-8 text-white" style={coverStyle(shown, related[0]?.accent)}>
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <button aria-label="Fermer" onClick={() => openPost(null)} className="glass absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full text-fg">
              <X size={15} strokeWidth={2.6} />
            </button>
            <div className="relative">
              <p className="mb-1.5 text-[12.5px] font-semibold text-white/85">
                {KIND_META[shown.kind].label} · {formatDay(shown.publish_at)}
              </p>
              <h1 className="t-large !text-[32px]">{shown.title}</h1>
            </div>
          </div>
          <div className="p-8">
            {shown.summary && <p className="mb-5 text-[19px] leading-snug font-medium text-muted">{shown.summary}</p>}
            <RichText html={shown.html} />
            {related.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
                {related.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => {
                      openPost(null);
                      go("apps", app.id);
                    }}
                    className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3.5 pl-1 text-[13px] font-medium transition hover:bg-surface-3"
                  >
                    <AppIcon app={app} size={26} /> {app.name}
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

export function ReleaseRow({ release, open, onToggle }: { release: Release; open: boolean; onToggle: () => void }) {
  const { appById } = usePulse();
  const app = appById(release.app);
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4.5 py-3.5 text-left transition-colors hover:bg-surface-2/60">
        <AppIcon app={app} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold">{app?.name ?? "Application"}</span>
            <span className="text-[13px] font-medium text-muted">{release.version}</span>
            {release.channel === "beta" && <Badge color="var(--orange)">{CHANNEL_LABEL.beta}</Badge>}
          </span>
          <span className="block truncate text-[13px] text-muted">{release.title || "Nouvelle version"}</span>
        </span>
        <span className="shrink-0 text-[12px] text-faint">{formatRelative(release.released_at)}</span>
      </button>
      {open && release.html && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={softSpring} className="overflow-hidden">
          <div className="px-4.5 pb-4 pl-[74px]">
            <RichText html={release.html} compact />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function HistoryBars({ app, incidents }: { app: PulseApp; incidents: Incident[] }) {
  const days = useMemo(() => incidentDays(app.id, incidents), [app.id, incidents]);
  const colors = ["var(--bar-empty)", "var(--yellow)", "var(--orange)", "var(--red)"];
  return (
    <div className="flex h-7 items-stretch gap-[2px]" role="img" aria-label={`Incidents déclarés sur 90 jours pour ${app.name}`}>
      {days.map((day) => (
        <span
          key={day.date.toISOString()}
          title={`${day.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${day.titles.length ? day.titles.join(", ") : "aucun incident déclaré"}`}
          className="min-w-0 flex-1 rounded-[2px] transition-transform hover:scale-y-110"
          style={{ background: colors[day.rank] }}
        />
      ))}
    </div>
  );
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const { appById } = usePulse();
  const severity = SEVERITY_META[incident.severity];
  const resolved = incident.phase === "resolved";
  const names = incident.apps.map((id) => appById(id)?.name).filter(Boolean).join(", ");
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-headline">{incident.title}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {names ? `${names} · ` : ""}
            {formatTime(incident.started_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {!resolved && <Badge color={severity.color}>{severity.label}</Badge>}
          <Badge color={resolved ? "var(--green)" : "var(--accent)"}>{PHASE_LABEL[incident.phase]}</Badge>
        </div>
      </div>
      {incident.updates.length > 0 && (
        <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">
          {[...incident.updates].reverse().map((update) => (
            <li key={update.id} className="relative">
              <span className="absolute top-[6px] -left-[21px] h-2 w-2 rounded-full" style={{ background: update.phase === "resolved" ? "var(--green)" : "var(--accent)" }} />
              <p className="text-[12px] font-semibold text-muted">
                {PHASE_LABEL[update.phase]} · {formatTime(update.created)}
              </p>
              <p className="selectable text-[13.5px]">{update.message}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AppStatusLabel({ app }: { app: PulseApp }) {
  const meta = STATUS_META[app.status] ?? STATUS_META.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: app.status === "unknown" ? "var(--muted)" : meta.color }}>
      <StatusDot color={meta.color} live={app.status !== "operational" && app.status !== "unknown"} size={8} />
      {meta.label}
    </span>
  );
}
