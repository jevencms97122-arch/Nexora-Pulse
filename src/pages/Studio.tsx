import { CircleCheck, ImagePlus, Megaphone, PackagePlus, Pencil, Plus, Siren, Trash2 } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../components/AppIcon";
import { AppStatusLabel, RichText } from "../components/Content";
import { Badge, Button, Empty, Field, IconButton, PageHeader, Segmented, Sheet, Switch } from "../components/ui";
import { api } from "../lib/api";
import { CHANNEL_LABEL, KIND_META, PHASE_LABEL, SEVERITY_META, STATUS_META, STATUS_ORDER, formatRelative, fromLocalInput, publishLabel, toLocalInput } from "../lib/format";
import type { AppInput, AppStatus, CoverInput, Incident, IncidentInput, Phase, Post, PostInput, PostKind, PublishState, PulseApp, Release, ReleaseInput, Severity } from "../lib/types";
import { usePulse } from "../state/pulse";

type Tab = "posts" | "releases" | "apps" | "incidents";

function AppPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { snapshot } = usePulse();
  return (
    <div className="flex flex-wrap gap-1.5">
      {snapshot.apps.map((app) => {
        const active = value.includes(app.id);
        return (
          <button
            type="button"
            key={app.id}
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((id) => id !== app.id) : [...value, app.id])}
            className={`flex h-8 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[12.5px] font-medium transition ${active ? "bg-accent text-white" : "bg-surface-2 hover:bg-surface-3"}`}
          >
            <AppIcon app={app} size={24} /> {app.name.replace(/^Nexora\s*/i, "") || app.name}
          </button>
        );
      })}
    </div>
  );
}

function ConfirmDelete({ onConfirm, warning }: { onConfirm: () => void; warning?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), warning ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [armed, warning]);
  return armed ? (
    <>
      {warning && <span className="max-w-[260px] text-right text-[12px] leading-tight font-medium text-[var(--red)]">{warning}</span>}
      <Button variant="danger" className="!h-8 !px-3" onClick={onConfirm}>
        Confirmer
      </Button>
    </>
  ) : (
    <IconButton label="Supprimer" onClick={() => setArmed(true)}>
      <Trash2 size={14} />
    </IconButton>
  );
}

function ListRow({ leading, title, detail, badges, actions }: { leading?: ReactNode; title: string; detail?: string; badges?: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 px-4.5 py-3">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{title}</p>
        {detail && <p className="truncate text-[12.5px] text-muted">{detail}</p>}
      </div>
      {badges}
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}

const stateColor = (state: string, label: string) => (state === "draft" ? "var(--gray)" : label === "Publié" ? "var(--green)" : "var(--accent)");

const blankPost = (): PostInput => ({ title: "", summary: "", body: "", kind: "announcement", apps: [], pinned: false, state: "draft", publish_at: new Date().toISOString() });

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function PostEditor({ initial, onClose }: { initial: Post | "new"; onClose: () => void }) {
  const { run, toast } = usePulse();
  const [form, setForm] = useState<PostInput>(() => (initial === "new" ? blankPost() : { id: initial.id, title: initial.title, summary: initial.summary, body: initial.body, kind: initial.kind, apps: initial.apps, pinned: initial.pinned, state: initial.state, publish_at: initial.publish_at }));
  const [view, setView] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState("");
  const [cover, setCover] = useState<CoverInput | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const existingCover = initial !== "new" && initial.cover && !removeCover;
  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (view === "preview") void api.renderMarkdown(form.body).then(setPreview);
  }, [view, form.body]);

  const pickCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("La couverture dépasse 5 Mo.", "error");
    setCover({ name: file.name, data: await readBase64(file) });
    setRemoveCover(false);
  };

  const save = async (state: PublishState) => {
    setBusy(true);
    const ok = await run(() => api.savePost({ ...form, state, remove_cover: removeCover }, cover), state === "draft" ? "Brouillon enregistré" : "Annonce publiée");
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial === "new" ? "Nouvelle annonce" : "Modifier l'annonce"}
      width={760}
      footer={
        <>
          <Button variant="secondary" disabled={busy || !form.title.trim()} onClick={() => void save("draft")}>
            Enregistrer le brouillon
          </Button>
          <Button disabled={busy || !form.title.trim()} onClick={() => void save("published")}>
            {new Date(form.publish_at.replace(" ", "T")).getTime() > Date.now() ? "Programmer" : "Publier"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <Field label="Titre">
          <input className="field !text-[17px] font-semibold" value={form.title} maxLength={160} autoFocus onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Résumé">
          <input className="field" value={form.summary} maxLength={320} onChange={(e) => set("summary", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select className="field" value={form.kind} onChange={(e) => set("kind", e.target.value as PostKind)}>
              {(Object.keys(KIND_META) as PostKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_META[kind].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date de publication" hint="Une date future programme l'annonce.">
            <input className="field" type="datetime-local" value={toLocalInput(form.publish_at)} onChange={(e) => set("publish_at", fromLocalInput(e.target.value) || form.publish_at)} />
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-muted">Applications concernées</span>
          <AppPicker value={form.apps} onChange={(apps) => set("apps", apps)} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-muted">Contenu (Markdown)</span>
            <Segmented
              label="Mode de l'éditeur"
              value={view}
              onChange={setView}
              options={[
                { value: "write", label: "Écrire" },
                { value: "preview", label: "Aperçu" },
              ]}
            />
          </div>
          {view === "write" ? (
            <textarea aria-label="Contenu" className="field selectable h-56 resize-y font-[inherit] leading-relaxed" value={form.body} onChange={(e) => set("body", e.target.value)} />
          ) : (
            <div className="min-h-56 rounded-xl bg-surface-2 p-4">{preview ? <RichText html={preview} /> : <p className="text-muted">Rien à prévisualiser.</p>}</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickCover(e)} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <ImagePlus size={14} /> {cover ? cover.name : existingCover ? "Changer la couverture" : "Ajouter une couverture"}
            </Button>
            {(cover || existingCover) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setCover(null);
                  setRemoveCover(initial !== "new" && !!initial.cover);
                }}
              >
                Retirer
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2.5 text-[13px] font-medium">
            Épingler <Switch label="Épingler l'annonce" checked={form.pinned} onChange={(pinned) => set("pinned", pinned)} />
          </label>
        </div>
      </div>
    </Sheet>
  );
}

function PostsPanel() {
  const { snapshot, run } = usePulse();
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const posts = [...snapshot.posts].sort((a, b) => b.publish_at.localeCompare(a.publish_at));
  return (
    <Panel
      action={
        <Button onClick={() => setEditing("new")}>
          <Plus size={15} /> Nouvelle annonce
        </Button>
      }
    >
      {posts.length === 0 && <Empty icon={<Megaphone size={24} />} title="Aucune annonce" text="Rédige la première annonce de l'écosystème." />}
      {posts.map((post) => {
        const label = publishLabel(post.state, post.publish_at);
        return (
          <ListRow
            key={post.id}
            title={post.title}
            detail={`${KIND_META[post.kind].label} · ${formatRelative(post.publish_at)}`}
            badges={<Badge color={stateColor(post.state, label)}>{label}</Badge>}
            actions={
              <>
                <IconButton label="Modifier" onClick={() => setEditing(post)}>
                  <Pencil size={14} />
                </IconButton>
                <ConfirmDelete onConfirm={() => void run(() => api.deleteRecord("pulse_posts", post.id), "Annonce supprimée")} />
              </>
            }
          />
        );
      })}
      {editing && <PostEditor initial={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function ReleaseEditor({ initial, onClose }: { initial: Release | "new"; onClose: () => void }) {
  const { run, snapshot } = usePulse();
  const [form, setForm] = useState<ReleaseInput>(() =>
    initial === "new"
      ? { app: snapshot.apps[0]?.id ?? "", version: "", title: "", notes: "", channel: "stable", state: "published", released_at: new Date().toISOString() }
      : { id: initial.id, app: initial.app, version: initial.version, title: initial.title, notes: initial.notes, channel: initial.channel, state: initial.state, released_at: initial.released_at },
  );
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ReleaseInput>(key: K, value: ReleaseInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = async (state: PublishState) => {
    setBusy(true);
    const ok = await run(() => api.saveRelease({ ...form, state }), state === "draft" ? "Brouillon enregistré" : "Version publiée");
    setBusy(false);
    if (ok) onClose();
  };
  const valid = form.app && form.version.trim();
  return (
    <Sheet
      open
      onClose={onClose}
      title={initial === "new" ? "Nouvelle version" : "Modifier la version"}
      footer={
        <>
          <Button variant="secondary" disabled={busy || !valid} onClick={() => void save("draft")}>
            Brouillon
          </Button>
          <Button disabled={busy || !valid} onClick={() => void save("published")}>
            Publier
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Application">
            <select className="field" value={form.app} onChange={(e) => set("app", e.target.value)}>
              {snapshot.apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Version">
            <input className="field" placeholder="1.2.0" value={form.version} autoFocus onChange={(e) => set("version", e.target.value)} />
          </Field>
          <Field label="Canal">
            <select className="field" value={form.channel} onChange={(e) => set("channel", e.target.value as ReleaseInput["channel"])}>
              <option value="stable">{CHANNEL_LABEL.stable}</option>
              <option value="beta">{CHANNEL_LABEL.beta}</option>
            </select>
          </Field>
          <Field label="Date de sortie">
            <input className="field" type="datetime-local" value={toLocalInput(form.released_at)} onChange={(e) => set("released_at", fromLocalInput(e.target.value) || form.released_at)} />
          </Field>
        </div>
        <Field label="Titre">
          <input className="field" value={form.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Notes de version (Markdown)">
          <textarea className="field h-44 resize-y font-[inherit]" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function ReleasesPanel() {
  const { snapshot, run, appById } = usePulse();
  const [editing, setEditing] = useState<Release | "new" | null>(null);
  const releases = [...snapshot.releases].sort((a, b) => b.released_at.localeCompare(a.released_at));
  return (
    <Panel
      action={
        <Button disabled={snapshot.apps.length === 0} onClick={() => setEditing("new")}>
          <Plus size={15} /> Nouvelle version
        </Button>
      }
    >
      {releases.length === 0 && <Empty icon={<PackagePlus size={24} />} title="Aucune version" text="Publie les notes de version de tes applis." />}
      {releases.map((release) => {
        const label = publishLabel(release.state, release.released_at);
        const app = appById(release.app);
        return (
          <ListRow
            key={release.id}
            leading={<AppIcon app={app} size={36} />}
            title={`${app?.name ?? "Application"} ${release.version}`}
            detail={release.title || CHANNEL_LABEL[release.channel]}
            badges={<Badge color={stateColor(release.state, label)}>{label}</Badge>}
            actions={
              <>
                <IconButton label="Modifier" onClick={() => setEditing(release)}>
                  <Pencil size={14} />
                </IconButton>
                <ConfirmDelete onConfirm={() => void run(() => api.deleteRecord("pulse_releases", release.id), "Version supprimée")} />
              </>
            }
          />
        );
      })}
      {editing && <ReleaseEditor initial={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function AppEditor({ initial, onClose }: { initial: PulseApp | "new"; onClose: () => void }) {
  const { run, snapshot } = usePulse();
  const [form, setForm] = useState<AppInput>(() =>
    initial === "new"
      ? { name: "", tagline: "", accent: "#0a84ff", store_id: "", status: "unknown", status_message: "", sort: (snapshot.apps.at(-1)?.sort ?? 0) + 10, visible: true }
      : { id: initial.id, name: initial.name, tagline: initial.tagline, accent: initial.accent, store_id: initial.store_id, status: initial.status, status_message: initial.status_message, sort: initial.sort, visible: initial.visible },
  );
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AppInput>(key: K, value: AppInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    setBusy(true);
    const ok = await run(() => api.saveApp(form), "Application mise à jour");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={initial === "new" ? "Nouvelle application" : form.name}
      footer={
        <Button disabled={busy || !form.name.trim()} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-[1fr_88px] gap-4">
          <Field label="Nom">
            <input className="field" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Couleur">
            <input className="field !h-[40px] !p-1" type="color" value={form.accent} onChange={(e) => set("accent", e.target.value)} />
          </Field>
        </div>
        <Field label="Description courte">
          <input className="field" value={form.tagline} maxLength={160} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field label="État">
          <select className="field" value={form.status} onChange={(e) => set("status", e.target.value as AppStatus)}>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message d'état">
          <input className="field" value={form.status_message} maxLength={280} placeholder="Facultatif" onChange={(e) => set("status_message", e.target.value)} />
        </Field>
        <label className="flex items-center justify-between text-[13.5px] font-medium">
          Visible dans l'application <Switch label="Visible" checked={form.visible} onChange={(visible) => set("visible", visible)} />
        </label>
      </div>
    </Sheet>
  );
}

function AppsPanel() {
  const { snapshot, run } = usePulse();
  const [editing, setEditing] = useState<PulseApp | "new" | null>(null);
  return (
    <Panel
      action={
        <>
          <Button variant="secondary" onClick={() => void run(() => api.importStoreApps(), "Catalogue Nexora Store importé")}>
            Importer depuis le Store
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus size={15} /> Ajouter
          </Button>
        </>
      }
    >
      {snapshot.apps.length === 0 && <Empty icon={<PackagePlus size={24} />} title="Aucune application" text="Importe le catalogue de Nexora Store pour commencer." />}
      {snapshot.apps.map((app) => (
        <ListRow
          key={app.id}
          leading={<AppIcon app={app} size={36} />}
          title={app.name}
          detail={app.status_message || app.tagline || (app.version ? `Version ${app.version}` : undefined)}
          badges={
            <>
              {!app.visible && <Badge>Masquée</Badge>}
              <AppStatusLabel app={app} />
            </>
          }
          actions={
            <>
              <IconButton label="Modifier" onClick={() => setEditing(app)}>
                <Pencil size={14} />
              </IconButton>
              <ConfirmDelete
                warning={(() => {
                  const versions = snapshot.releases.filter((r) => r.app === app.id).length;
                  return versions > 0 ? `Supprime aussi ${versions} version${versions > 1 ? "s" : ""}. Irréversible.` : "Irréversible.";
                })()}
                onConfirm={() => void run(() => api.deleteApp(app.id), "Application supprimée")}
              />
            </>
          }
        />
      ))}
      {editing && <AppEditor initial={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function NewIncident({ onClose }: { onClose: () => void }) {
  const { run } = usePulse();
  const [form, setForm] = useState<IncidentInput>({ title: "", severity: "minor", apps: [], message: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => api.openIncident(form), "Incident ouvert");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Déclarer un incident"
      footer={
        <Button disabled={busy || !form.title.trim() || !form.message.trim()} onClick={() => void save()}>
          Publier l'incident
        </Button>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <Field label="Titre">
          <input className="field" autoFocus value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Gravité">
          <select className="field" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
            {(Object.keys(SEVERITY_META) as Severity[]).map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_META[severity].label}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-muted">Applications touchées</span>
          <AppPicker value={form.apps} onChange={(apps) => setForm({ ...form, apps })} />
        </div>
        <Field label="Premier message">
          <textarea className="field h-24 resize-y font-[inherit]" value={form.message} maxLength={2000} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

function IncidentUpdateSheet({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { run } = usePulse();
  const [phase, setPhase] = useState<Phase>(incident.phase === "resolved" ? "resolved" : incident.phase);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => api.updateIncident(incident.id, phase, message), phase === "resolved" ? "Incident résolu" : "Incident mis à jour");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={incident.title}
      footer={
        <Button disabled={busy || !message.trim()} onClick={() => void save()}>
          Publier la mise à jour
        </Button>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <Field label="Étape">
          <select className="field" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
            {(Object.keys(PHASE_LABEL) as Phase[]).map((value) => (
              <option key={value} value={value}>
                {PHASE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message">
          <textarea className="field h-28 resize-y font-[inherit]" autoFocus value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function IncidentsPanel() {
  const { snapshot, run } = usePulse();
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<Incident | null>(null);
  return (
    <Panel
      action={
        <Button onClick={() => setCreating(true)}>
          <Siren size={15} /> Déclarer un incident
        </Button>
      }
    >
      {snapshot.incidents.length === 0 && <Empty icon={<CircleCheck size={24} />} title="Aucun incident" text="Tout est calme pour le moment." />}
      {snapshot.incidents.map((incident) => (
        <ListRow
          key={incident.id}
          title={incident.title}
          detail={`${SEVERITY_META[incident.severity].label} · ${formatRelative(incident.started_at)}`}
          badges={<Badge color={incident.phase === "resolved" ? "var(--green)" : "var(--accent)"}>{PHASE_LABEL[incident.phase]}</Badge>}
          actions={
            <>
              <IconButton label="Ajouter une mise à jour" onClick={() => setUpdating(incident)}>
                <Pencil size={14} />
              </IconButton>
              <ConfirmDelete onConfirm={() => void run(() => api.deleteRecord("pulse_incidents", incident.id), "Incident supprimé")} />
            </>
          }
        />
      ))}
      {creating && <NewIncident onClose={() => setCreating(false)} />}
      {updating && <IncidentUpdateSheet incident={updating} onClose={() => setUpdating(null)} />}
    </Panel>
  );
}

const ActionSlot = createContext<HTMLElement | null>(null);

/** A Studio section. Its main action is displayed in the page header. */
function Panel({ action, children }: { action: ReactNode; children: ReactNode }) {
  const slot = useContext(ActionSlot);
  return (
    <>
      {slot && createPortal(action, slot)}
      <div className="card divide-y divide-[var(--line)] overflow-hidden">{children}</div>
    </>
  );
}

export function Studio() {
  const { editor, setLoginOpen } = usePulse();
  const [tab, setTab] = useState<Tab>("posts");
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  if (!editor) {
    return (
      <div className="card">
        <Empty icon={<Pencil size={24} />} title="Studio réservé à l'équipe" text="Connecte-toi pour publier." action={<Button onClick={() => setLoginOpen(true)}>Se connecter</Button>} />
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow={editor.name || editor.email} title="Studio">
        <div ref={setSlot} className="flex items-center gap-2" />
      </PageHeader>
      <div className="mb-5">
        <Segmented<Tab>
          label="Section du Studio"
          value={tab}
          onChange={setTab}
          options={[
            { value: "posts", label: "Annonces" },
            { value: "releases", label: "Versions" },
            { value: "apps", label: "États" },
            { value: "incidents", label: "Incidents" },
          ]}
        />
      </div>
      <ActionSlot.Provider value={slot}>
        {tab === "posts" && <PostsPanel />}
        {tab === "releases" && <ReleasesPanel />}
        {tab === "apps" && <AppsPanel />}
        {tab === "incidents" && <IncidentsPanel />}
      </ActionSlot.Provider>
    </>
  );
}
