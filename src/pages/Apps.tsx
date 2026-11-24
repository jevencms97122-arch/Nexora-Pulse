import { ChevronLeft, LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { AppStatusLabel, HistoryBars, IncidentCard, PostCard, ReleaseRow } from "../components/Content";
import { Empty, PageHeader, Reveal, SectionTitle, softSpring } from "../components/ui";
import type { PulseApp } from "../lib/types";
import { usePulse } from "../state/pulse";

function AppDetail({ app }: { app: PulseApp }) {
  const { posts, releases, snapshot, go } = usePulse();
  const [open, setOpen] = useState<string | null>(null);
  const appPosts = posts.filter((p) => p.apps.includes(app.id));
  const appReleases = releases.filter((r) => r.app === app.id);
  const incidents = snapshot.incidents.filter((i) => i.apps.includes(app.id));
  const activeIncidents = incidents.filter((i) => i.phase !== "resolved");
  const version = app.version || appReleases[0]?.version;

  return (
    <>
      <button onClick={() => go("apps")} className="mb-4 -ml-1 flex items-center text-[14px] font-medium text-accent hover:underline">
        <ChevronLeft size={18} /> Applications
      </button>
      <Reveal>
        <header
          className="squircle mb-7 flex items-center gap-6 rounded-[28px] p-8"
          style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${app.accent} 20%, var(--surface)), var(--surface) 74%)`, boxShadow: "var(--shadow-card)" }}
        >
          <AppIcon app={app} size={104} />
          <div className="min-w-0 flex-1">
            <h1 className="t-large truncate">{app.name}</h1>
            {app.tagline && <p className="mt-1 text-[16px] text-muted">{app.tagline}</p>}
            <div className="mt-3 flex items-center gap-4">
              <AppStatusLabel app={app} />
              {version && <span className="text-[12.5px] font-medium text-muted">Version {version}</span>}
            </div>
            {app.status_message && <p className="mt-1.5 text-[13px] text-muted">{app.status_message}</p>}
          </div>
        </header>
      </Reveal>
      {activeIncidents.length > 0 && (
        <Reveal className="mb-8">
          <SectionTitle title="Incident en cours" />
          <div className="space-y-4">
            {activeIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </Reveal>
      )}
      <Reveal delay={0.05} className="mb-8">
        <SectionTitle title="Historique sur 90 jours" />
        <div className="card p-5">
          <HistoryBars app={app} incidents={snapshot.incidents} />
        </div>
      </Reveal>
      <Reveal delay={0.08} className="mb-8">
        <SectionTitle title="Notes de version" />
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {appReleases.length === 0 && <p className="p-6 text-center text-muted">Aucune note de version pour le moment.</p>}
          {appReleases.map((release) => (
            <ReleaseRow key={release.id} release={release} open={open === release.id} onToggle={() => setOpen(open === release.id ? null : release.id)} />
          ))}
        </div>
      </Reveal>
      {appPosts.length > 0 && (
        <Reveal delay={0.1}>
          <SectionTitle title="Annonces" />
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
            {appPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </Reveal>
      )}
    </>
  );
}

export function Apps() {
  const { apps, appId, appById, go } = usePulse();
  const selected = appId ? appById(appId) : undefined;
  if (selected) return <AppDetail app={selected} />;

  return (
    <>
      <PageHeader title="Applications" />
      {apps.length === 0 ? (
        <div className="card">
          <Empty icon={<LayoutGrid size={24} />} title="Aucune application" text="Les applications de l'écosystème Nexora apparaîtront ici." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {apps.map((app, index) => (
            <Reveal key={app.id} delay={Math.min(index * 0.03, 0.2)}>
              <motion.button
                onClick={() => go("apps", app.id)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.985 }}
                transition={softSpring}
                className="card flex h-full w-full items-center gap-4 p-5 text-left hover:shadow-[var(--shadow-hover)]"
              >
                <AppIcon app={app} size={68} />
                <span className="min-w-0 flex-1">
                  <span className="t-headline block truncate">{app.name}</span>
                  <span className="block truncate text-[13px] text-muted">{app.tagline || (app.version ? `Version ${app.version}` : "Écosystème Nexora")}</span>
                  <span className="mt-1.5 block">
                    <AppStatusLabel app={app} />
                  </span>
                </span>
              </motion.button>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
