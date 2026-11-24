import { Activity } from "lucide-react";
import { AppStatusLabel, HistoryBars, IncidentCard } from "../components/Content";
import { AppIcon } from "../components/AppIcon";
import { HeartbeatLine } from "../components/Logo";
import { Empty, PageHeader, Reveal, SectionTitle } from "../components/ui";
import { formatRelative, overallStatus } from "../lib/format";
import { usePulse } from "../state/pulse";

export function Status() {
  const { apps, snapshot, go } = usePulse();
  const overall = overallStatus(apps, snapshot.incidents);
  const open = snapshot.incidents.filter((i) => i.phase !== "resolved");
  const past = snapshot.incidents.filter((i) => i.phase === "resolved").slice(0, 8);

  return (
    <>
      <PageHeader title="État" />
      <Reveal>
        <section
          className="squircle mb-7 flex items-center gap-6 rounded-[28px] p-8"
          style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${overall.color} 17%, var(--surface)), var(--surface) 72%)`, boxShadow: "var(--shadow-card)" }}
        >
          <HeartbeatLine color={overall.color} width={92} />
          <div className="min-w-0">
            <h2 className="t-large !text-[30px]">{overall.title}</h2>
            <p className="mt-1 text-[15px] text-muted">
              {overall.detail}
              {snapshot.fetched_at ? ` Vérifié ${formatRelative(snapshot.fetched_at)}.` : ""}
            </p>
          </div>
        </section>
      </Reveal>

      {open.length > 0 && (
        <Reveal delay={0.04} className="mb-8">
          <SectionTitle title="Incidents en cours" />
          <div className="space-y-4">
            {open.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.08} className="mb-8">
        <SectionTitle title="Applications" />
        {apps.length === 0 ? (
          <div className="card">
            <Empty icon={<Activity size={24} />} title="Aucune application" text="Les applications Nexora apparaîtront ici dès qu'elles seront ajoutées." />
          </div>
        ) : (
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {apps.map((app) => (
              <button key={app.id} onClick={() => go("apps", app.id)} className="block w-full px-5 py-4 text-left transition-colors hover:bg-surface-2/60">
                <span className="mb-2.5 flex items-center gap-3">
                  <AppIcon app={app} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{app.name}</span>
                    {app.status_message && <span className="block truncate text-[12.5px] text-muted">{app.status_message}</span>}
                  </span>
                  <AppStatusLabel app={app} />
                </span>
                <HistoryBars app={app} incidents={snapshot.incidents} />
              </button>
            ))}
            <div className="flex justify-between px-5 py-2.5 text-[11.5px] text-faint">
              <span>Il y a 90 jours</span>
              <span>Incidents déclarés par l'équipe, pas une mesure automatique</span>
              <span>Aujourd'hui</span>
            </div>
          </div>
        )}
      </Reveal>

      {past.length > 0 && (
        <Reveal delay={0.1}>
          <SectionTitle title="Incidents passés" />
          <div className="grid grid-cols-2 items-start gap-4">
            {past.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </Reveal>
      )}
    </>
  );
}
