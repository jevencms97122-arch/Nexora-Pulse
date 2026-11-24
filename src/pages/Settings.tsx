import { LogOut, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { AppIcon } from "../components/AppIcon";
import { Button, PageHeader, Reveal, Segmented, Switch } from "../components/ui";
import { api, inTauri } from "../lib/api";
import { usePulse } from "../state/pulse";
import { useTheme, type ThemeChoice } from "../state/theme";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-1.5 px-4 text-[12.5px] font-semibold text-muted">{title}</h2>
      <div className="card divide-y divide-[var(--line)] overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 px-4.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        {detail && <p className="text-[12.5px] text-muted">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

function updateText(phase: string | undefined, version: string | null | undefined, error: string | null | undefined) {
  switch (phase) {
    case "checking":
      return "Recherche d'une nouvelle version...";
    case "downloading":
      return `Téléchargement de la version ${version}...`;
    case "ready":
      return `La version ${version} est prête à être installée.`;
    case "installing":
      return "Installation en cours...";
    case "uptodate":
      return "Nexora Pulse est à jour.";
    case "error":
      return error ? `Vérification impossible : ${error}` : "Vérification impossible.";
    case "dev":
      return "Désactivé en mode développement.";
    default:
      return "Recherche automatique toutes les 4 heures.";
  }
}

export function Settings() {
  const { prefs, savePrefs, apps, editor, logout, setLoginOpen, info, update, go } = usePulse();
  const [theme, setTheme] = useTheme();
  const busy = update?.phase === "checking" || update?.phase === "downloading" || update?.phase === "installing";

  const toggleApp = (id: string, enabled: boolean) => {
    const muted = enabled ? prefs.muted_apps.filter((a) => a !== id) : [...prefs.muted_apps, id];
    void savePrefs({ ...prefs, muted_apps: muted });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Réglages" />
      <Reveal>
        <Group title="Apparence">
          <Row title="Thème">
            <Segmented<ThemeChoice>
              label="Thème"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Clair" },
                { value: "dark", label: "Sombre" },
              ]}
            />
          </Row>
        </Group>

        <Group title="Notifications">
          <Row title="Notifications Windows" detail="Annonces, nouvelles versions et incidents">
            <Switch label="Notifications Windows" checked={prefs.notifications} onChange={(notifications) => void savePrefs({ ...prefs, notifications })} />
          </Row>
          {prefs.notifications &&
            apps.map((app) => (
              <div key={app.id} className="flex h-[50px] items-center gap-3 px-4.5">
                <AppIcon app={app} size={28} />
                <span className="flex-1 truncate text-[14px]">{app.name}</span>
                <Switch label={`Notifications de ${app.name}`} checked={!prefs.muted_apps.includes(app.id)} onChange={(enabled) => toggleApp(app.id, enabled)} />
              </div>
            ))}
        </Group>

        <Group title="Général">
          <Row title="Lancer au démarrage de Windows" detail="Démarre discrètement dans la zone de notification">
            <Switch label="Lancer au démarrage de Windows" checked={prefs.autostart} onChange={(autostart) => void savePrefs({ ...prefs, autostart })} />
          </Row>
          <Row title="Garder en arrière-plan à la fermeture" detail="Pour continuer à recevoir les notifications">
            <Switch label="Garder en arrière-plan" checked={prefs.close_to_tray} onChange={(close_to_tray) => void savePrefs({ ...prefs, close_to_tray })} />
          </Row>
        </Group>

        <Group title="Mise à jour">
          <Row title={`Nexora Pulse ${info?.version ?? ""}`} detail={updateText(update?.phase, update?.version, update?.error)}>
            {update?.phase === "ready" ? (
              <Button onClick={() => void api.updateInstall()}>Redémarrer</Button>
            ) : (
              <Button variant="secondary" disabled={busy || !inTauri || update?.phase === "dev"} onClick={() => void api.updateCheck()}>
                Rechercher
              </Button>
            )}
          </Row>
        </Group>

        <Group title="Administration">
          {editor ? (
            <>
              <Row title={editor.name || "Éditeur"} detail={editor.email}>
                <Button variant="secondary" onClick={() => go("studio")}>
                  <PenLine size={14} /> Studio
                </Button>
              </Row>
              <button onClick={() => void logout()} className="flex h-[48px] w-full items-center gap-2 px-4.5 text-[14px] font-medium text-[var(--red)] transition-colors hover:bg-surface-2/60">
                <LogOut size={15} /> Se déconnecter
              </button>
            </>
          ) : (
            <Row title="Studio Nexora" detail="Réservé à l'équipe, pour publier et gérer les états">
              <Button variant="secondary" onClick={() => setLoginOpen(true)}>
                Se connecter
              </Button>
            </Row>
          )}
        </Group>
      </Reveal>
    </div>
  );
}
