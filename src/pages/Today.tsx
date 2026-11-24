import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { HeroPost, PostRow, ReleaseRow } from "../components/Content";
import { Empty, PageHeader, Reveal, SectionTitle, StatusDot } from "../components/ui";
import { formatToday, overallStatus } from "../lib/format";
import { usePulse } from "../state/pulse";

export function Today() {
  const { posts, releases, apps, incidents, loaded, go } = usePulse();
  const [openRelease, setOpenRelease] = useState<string | null>(null);
  const overall = overallStatus(apps, incidents);
  const calm = overall.color === "var(--green)" || overall.color === "var(--gray)";
  const [hero, ...rest] = posts;
  const more = (page: "posts" | "releases") => (
    <button onClick={() => go(page)} className="text-[13px] font-medium text-accent">
      Tout voir
    </button>
  );

  if (!loaded && posts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={formatToday()} title="Aujourd'hui" />
        <div className="skeleton mb-4 h-[300px] !rounded-[24px]" />
        <div className="skeleton h-[68px]" />
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
            <Empty icon={<Sparkles size={22} />} title="Rien de neuf pour l'instant" text="Les prochaines annonces de l'équipe Nexora apparaîtront ici." />
          </div>
        )}
      </Reveal>

      <Reveal delay={0.03} className="mt-4">
        <button onClick={() => go("apps")} className="card flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-surface-2/60">
          <StatusDot color={overall.color} live={!calm} size={10} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{overall.title}</span>
            <span className="block truncate text-[13px] text-muted">{overall.detail}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </button>
      </Reveal>

      {releases.length > 0 && (
        <Reveal delay={0.06} className="mt-10">
          <SectionTitle title="Dernières mises à jour" action={more("releases")} />
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {releases.slice(0, 3).map((release) => (
              <ReleaseRow key={release.id} release={release} open={openRelease === release.id} onToggle={() => setOpenRelease(openRelease === release.id ? null : release.id)} />
            ))}
          </div>
        </Reveal>
      )}

      {rest.length > 0 && (
        <Reveal delay={0.09} className="mt-10">
          <SectionTitle title="Annonces" action={more("posts")} />
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {rest.slice(0, 4).map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        </Reveal>
      )}
    </>
  );
}
