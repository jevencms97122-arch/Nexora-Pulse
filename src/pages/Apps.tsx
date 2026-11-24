import { ChevronLeft, LayoutGrid } from "lucide-react";
import { useEffect, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { AppStatusLabel, IncidentCard, InfoRow, LatencyLabel, PostRow, ReleaseRow, latencyOf } from "../components/Content";
import { Empty, PageHeader, Reveal, SectionTitle, StatusDot } from "../components/ui";
import { formatRelative, overallStatus } from "../lib/format";
import type { PulseApp } from "../lib/types";
import { usePulse } from "../state/pulse";

function AppDetail({ app }: { app: PulseApp }) {
  const { posts, releases, incidents, pings, pingNow, go } = usePulse();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void pingNow();
  }, [pingNow]);

  const appPosts = posts.filter((p) => p.apps.includes(app.id));
  const appReleases = releases.filter((r) => r.app === app.id);
  const activeIncidents = incidents.filter((i) => i.apps.includes(app.id) && i.phase !== "resolved");
  const version = app.version || appReleases[0]?.version;

  return (
    <>
      <button onClick={() => go("apps")} className="mb-6 -ml-1.5 flex items-center text-[14px] font-medium text-accent">
        <ChevronLeft size={18} /> Applications
      </button>

      <Reveal>
        <header className="mb-10 flex items-center gap-5">
          <AppIcon app={app} size={80} />
          <div className="min-w-0">
            <h1 className="t-large truncate">{app.name}</h1>
            {app.tagline && <p className="mt-1 text-[15px] text-muted">{app.tagline}</p>}
          </div>
        </header>
      </Reveal>

      <Reveal delay={0.03} className="mb-10">
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          <InfoRow label="État">
            <AppStatusLabel app={app} />
          </InfoRow>
          {latencyOf(app, pings) !== null && (
            <InfoRow label="Temps de réponse">
              <LatencyLabel app={app} />
            </InfoRow>
          )}
          {app.status_message && <InfoRow label="Message">{app.status_message}</InfoRow>}
          {version && (
            <InfoRow label="Version">
              <span className="tabular-nums">{version}</span>
            </InfoRow>
          )}
        </div>
      </Reveal>

      {activeIncidents.length > 0 && (
        <Reveal delay={0.05} className="mb-10">
          <SectionTitle title="Incident en cours" />
          <div className="space-y-3">
            {activeIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </Reveal>
      )}

      {appReleases.length > 0 && (
        <Reveal delay={0.07} className="mb-10">
          <SectionTitle title="Notes de version" />
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {appReleases.map((release) => (
              <ReleaseRow key={release.id} release={release} open={open === release.id} onToggle={() => setOpen(open === release.id ? null : release.id)} />
            ))}
          </div>
        </Reveal>
      )}

      {appPosts.length > 0 && (
        <Reveal delay={0.09}>
          <SectionTitle title="Annonces" />
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {appPosts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        </Reveal>
      )}
    </>
  );
}

export function Apps() {
  const { apps, appId, appById, go, pingNow, incidents, snapshot } = usePulse();
  const selected = appId ? appById(appId) : undefined;

  // Ping every configured address when the list opens, then keep it fresh while it stays open.
  useEffect(() => {
    if (selected) return;
    void pingNow();
    const timer = window.setInterval(() => void pingNow(), 30000);
    return () => window.clearInterval(timer);
  }, [selected, pingNow]);

  if (selected) return <AppDetail app={selected} />;

  const overall = overallStatus(apps, incidents);
  const calm = overall.color === "var(--green)" || overall.color === "var(--gray)";
  const open = incidents.filter((i) => i.phase !== "resolved");
  const pinged = apps.some((a) => a.check_kind === "http" || a.check_kind === "tcp");

  return (
    <>
      <PageHeader title="Applications" />

      {apps.length > 0 && (
        <Reveal>
          <div className="mb-8 flex items-center gap-3.5 px-1">
            <StatusDot color={overall.color} live={!calm} size={10} />
            <div className="min-w-0">
              <p className="text-[16px] font-semibold">{overall.title}</p>
              <p className="text-[13px] text-muted">
                {overall.detail}
                {snapshot.fetched_at ? ` Vérifié ${formatRelative(snapshot.fetched_at)}.` : ""}
              </p>
            </div>
          </div>
        </Reveal>
      )}

      {open.length > 0 && (
        <Reveal delay={0.03} className="mb-8">
          <SectionTitle title="Incidents en cours" />
          <div className="space-y-3">
            {open.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </Reveal>
      )}

      {apps.length === 0 ? (
        <div className="card">
          <Empty icon={<LayoutGrid size={22} />} title="Aucune application" text="Les applications de l'écosystème Nexora apparaîtront ici." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {apps.map((app, index) => (
            <Reveal key={app.id} delay={Math.min(index * 0.02, 0.15)}>
              <button onClick={() => go("apps", app.id)} className="card flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-surface-2/60">
                <AppIcon app={app} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{app.name}</span>
                  <span className="mt-1 flex items-center gap-3">
                    <AppStatusLabel app={app} />
                    <LatencyLabel app={app} />
                  </span>
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      )}
      {apps.length > 0 && (
        <div className="mt-3 space-y-1 px-1 text-[12px] text-faint">
          {pinged && <p>Temps de réponse mesuré depuis cet ordinateur.</p>}
          <p>
            Certains services s'arrêtent la nuit (UTC-4) : en semaine à 21h, le week-end à 23h, jusqu'au lendemain matin. Cet arrêt est une routine : il n'est jamais considéré comme une panne, et les services
            restent comptés comme opérationnels.
          </p>
        </div>
      )}
    </>
  );
}
