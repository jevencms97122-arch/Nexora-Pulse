import { CircleArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ReleaseRow } from "../components/Content";
import { Empty, PageHeader, Reveal } from "../components/ui";
import { formatMonth } from "../lib/format";
import type { Release } from "../lib/types";
import { usePulse } from "../state/pulse";

export function Releases() {
  const { releases, apps } = usePulse();
  const [app, setApp] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Release[]>();
    for (const release of releases) {
      if (app && release.app !== app) continue;
      const key = formatMonth(release.released_at);
      map.set(key, [...(map.get(key) ?? []), release]);
    }
    return [...map.entries()];
  }, [releases, app]);

  return (
    <>
      <PageHeader title="Mises à jour">
        <select aria-label="Filtrer par application" className="field !h-9 !w-48 !py-0" value={app} onChange={(e) => setApp(e.target.value)}>
          <option value="">Toutes les applis</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </PageHeader>
      {groups.length === 0 ? (
        <div className="card">
          <Empty icon={<CircleArrowUp size={24} />} title="Aucune mise à jour" text="Les mises à jour des applis Nexora apparaîtront ici." />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([month, list], index) => (
            <Reveal key={month} delay={Math.min(index * 0.05, 0.2)}>
              <h2 className="mb-3 px-1 text-[17px] font-semibold">{month}</h2>
              <div className="card divide-y divide-[var(--line)] overflow-hidden">
                {list.map((release) => (
                  <ReleaseRow key={release.id} release={release} open={open === release.id} onToggle={() => setOpen(open === release.id ? null : release.id)} />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
