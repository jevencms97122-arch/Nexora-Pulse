import { Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
import { PostCard } from "../components/Content";
import { Empty, PageHeader, Reveal, Segmented } from "../components/ui";
import { KIND_META } from "../lib/format";
import type { PostKind } from "../lib/types";
import { usePulse } from "../state/pulse";

type Filter = "all" | PostKind;

export function Posts() {
  const { posts, apps } = usePulse();
  const [kind, setKind] = useState<Filter>("all");
  const [app, setApp] = useState("");
  const shown = useMemo(() => posts.filter((p) => (kind === "all" || p.kind === kind) && (!app || p.apps.includes(app))), [posts, kind, app]);

  return (
    <>
      <PageHeader title="Annonces">
        <select aria-label="Filtrer par application" className="field !h-9 !w-48 !py-0" value={app} onChange={(e) => setApp(e.target.value)}>
          <option value="">Toutes les applis</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </PageHeader>
      <div className="mb-6">
        <Segmented<Filter>
          label="Type d'annonce"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "Tout" },
            ...(Object.keys(KIND_META) as PostKind[]).map((value) => ({ value, label: KIND_META[value].plural })),
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <Empty icon={<Megaphone size={24} />} title="Aucune annonce" text="Rien ne correspond à ces filtres pour le moment." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {shown.map((post, index) => (
            <Reveal key={post.id} delay={Math.min(index * 0.03, 0.2)}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
