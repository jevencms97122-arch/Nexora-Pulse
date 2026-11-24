import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, CircleArrowUp, Copy, LayoutGrid, Megaphone, Minus, PenLine, RotateCw, Settings, Sparkles, Square, WifiOff, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { api, inTauri } from "../lib/api";
import type { Page } from "../lib/types";
import { usePulse } from "../state/pulse";
import { HeartbeatLine, Logo } from "./Logo";
import { spring } from "./ui";

const NAV: { page: Page; label: string; icon: ReactNode }[] = [
  { page: "today", label: "Aujourd'hui", icon: <Sparkles size={17} /> },
  { page: "posts", label: "Annonces", icon: <Megaphone size={17} /> },
  { page: "releases", label: "Mises à jour", icon: <CircleArrowUp size={17} /> },
  { page: "status", label: "État", icon: <Activity size={17} /> },
  { page: "apps", label: "Applications", icon: <LayoutGrid size={17} /> },
];

function NavItem({ page, label, icon }: { page: Page; label: string; icon: ReactNode }) {
  const { page: current, go } = usePulse();
  const active = current === page;
  return (
    <button
      onClick={() => go(page)}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors ${active ? "text-white" : "text-fg hover:bg-[var(--line)]"}`}
    >
      {active && <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-[10px] bg-accent" />}
      <span className={`relative ${active ? "text-white" : "text-accent"}`}>{icon}</span>
      <span className="relative truncate">{label}</span>
    </button>
  );
}

function UpdatePill() {
  const { update } = usePulse();
  if (!update || !["downloading", "ready", "installing"].includes(update.phase)) return null;
  const ready = update.phase === "ready";
  const percent = update.progress >= 0 ? Math.round(update.progress * 100) : null;
  return (
    <div className="card mb-2 !rounded-[14px] p-3">
      <p className="text-[12.5px] font-semibold">
        {ready ? `Version ${update.version} prête` : update.phase === "installing" ? "Installation..." : `Téléchargement de la ${update.version}`}
      </p>
      {ready ? (
        <button onClick={() => void api.updateInstall()} className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-accent">
          <RotateCw size={12} strokeWidth={2.6} /> Redémarrer
        </button>
      ) : (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${percent ?? 40}%` }} />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { snapshot, editor } = usePulse();
  return (
    <aside className="sidebar relative flex w-[244px] shrink-0 flex-col px-3 pb-3">
      <div data-tauri-drag-region className="flex h-[72px] shrink-0 items-center gap-2.5 px-1.5">
        <span className="pointer-events-none">
          <Logo size={34} />
        </span>
        <div className="pointer-events-none leading-tight">
          <p className="text-[11px] font-medium text-muted">Nexora</p>
          <p className="t-headline -mt-0.5">Pulse</p>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
        {NAV.map((item) => (
          <NavItem key={item.page} {...item} />
        ))}
        {editor && (
          <>
            <p className="mt-4 mb-1 px-2.5 text-[11px] font-semibold text-faint">Administration</p>
            <NavItem page="studio" label="Studio" icon={<PenLine size={17} />} />
          </>
        )}
      </nav>
      <div className="mt-auto">
        <UpdatePill />
        <NavItem page="settings" label="Réglages" icon={<Settings size={17} />} />
        <div className="mt-1.5 flex h-7 items-center gap-2 px-2.5 text-[11.5px] font-medium text-muted">
          {snapshot.online ? (
            <>
              <HeartbeatLine color={snapshot.live ? "var(--green)" : "var(--gray)"} width={26} />
              {!inTauri ? "Mode démo" : snapshot.live ? "En direct" : "Connecté"}
            </>
          ) : (
            <>
              <WifiOff size={13} /> Hors ligne
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized);
    sync();
    const off = win.onResized(sync);
    return () => void off.then((stop) => stop());
  }, []);

  if (!inTauri) return null;
  const win = getCurrentWindow();
  const control = "grid h-9 w-[46px] place-items-center text-muted transition-colors hover:bg-[var(--line)] hover:text-fg";
  return (
    <div data-tauri-drag-region className="absolute top-0 right-0 left-0 z-40 flex h-9 justify-end">
      <button aria-label="Réduire" className={control} onClick={() => void win.minimize()}>
        <Minus size={15} />
      </button>
      <button aria-label={maximized ? "Restaurer" : "Agrandir"} className={control} onClick={() => void win.toggleMaximize()}>
        {maximized ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
      </button>
      <button aria-label="Fermer" className="grid h-9 w-[46px] place-items-center text-muted transition-colors hover:bg-[#e81123] hover:text-white" onClick={() => void win.close()}>
        <X size={16} />
      </button>
    </div>
  );
}
