import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { HeroPost, PostCard, ReleaseRow } from "../components/Content";
import { HeartbeatLine } from "../components/Logo";
import { AnimatedNumber, Button, Empty, PageHeader, Reveal, SectionTitle, Skeletons } from "../components/ui";
import { formatToday, overallStatus } from "../lib/format";
import { usePulse } from "../state/pulse";

export function Today() {
  const { posts, releases, apps, snapshot, loaded, go } = usePulse();
  const [openRelease, setOpenRelease] = useState<string | null>(null);
  const overall = overallStatus(apps, snapshot.incidents);
  const openIncidents = snapshot.incidents.filter((i) => i.phase !== "resolved").length;
  const operational = apps.filter((a) => a.status === "operational").length;
  const [hero, ...rest] = posts;
  const more = (page: "posts" | "releases") => (
    <button onClick={() => go(page)} className="flex items-center text-[13px] font-medium text-accent hover:underline">
      Tout voir <ChevronRight size={14} />
    </button>
  );

  if (!loaded && posts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={formatToday()} title="Aujourd'hui" />
        <div className="skeleton mb-5 h-[340px] !rounded-[28px]" />
        <Skeletons />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={formatToday()} title="Aujourd'hui" />
      <Reveal>
        {hero ? (
          <HeroPost post={hero} />
        ) : (
          <div className="card">
            <Empty icon={<Sparkles size={24} />} title="Rien de neuf pour l'instant" text="Les prochaines annonces de l'équipe Nexora apparaîtront ici." />
          </div>
        )}
      </Reveal>

      <Reveal delay={0.06} className="mt-6 grid grid-cols-[1.45fr_1fr] gap-6">
        <section>
          <SectionTitle title="Dernières mises à jour" action={releases.length > 0 ? more("releases") : undefined} />
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {releases.length === 0 && <p className="p-6 text-center text-muted">Aucune version publiée pour le moment.</p>}
            {releases.slice(0, 4).map((release) => (
              <ReleaseRow key={release.id} release={release} open={openRelease === release.id} onToggle={() => setOpenRelease(openRelease === release.id ? null : release.id)} />
            ))}
          </div>
        </section>
        <section>
          <SectionTitle title="État de l'écosystème" />
          <button onClick={() => go("status")} className="card block w-full p-5.5 text-left transition-shadow hover:shadow-[var(--shadow-hover)]">
            <HeartbeatLine color={overall.color} width={58} />
            <p className="t-title mt-3 !text-[22px]">{overall.title}</p>
            <p className="mt-1 text-muted">{overall.detail}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
              {[
                { value: apps.length, label: "Applis" },
                { value: operational, label: "En ligne" },
                { value: openIncidents, label: "Incidents" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="t-title tabular-nums">
                    <AnimatedNumber value={stat.value} />
                  </p>
                  <p className="text-[12px] text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </button>
        </section>
      </Reveal>

      {rest.length > 0 && (
        <Reveal delay={0.1} className="mt-8">
          <SectionTitle title="À la une" action={more("posts")} />
          <div className="grid grid-cols-3 gap-5">
            {rest.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </Reveal>
      )}
      {posts.length === 0 && releases.length === 0 && apps.length === 0 && (
        <div className="mt-6 text-center">
          <Button variant="secondary" onClick={() => go("settings")}>
            Ouvrir les réglages
          </Button>
        </div>
      )}
    </>
  );
}
