import { CircleAlert, CircleCheck, RotateCw, ServerCog, WifiOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArticleSheet } from "./components/Content";
import { LoginSheet } from "./components/LoginSheet";
import { Logo } from "./components/Logo";
import { Sidebar, TitleBar } from "./components/Shell";
import { Button, softSpring, spring } from "./components/ui";
import { api, inTauri } from "./lib/api";
import { formatRelative } from "./lib/format";
import { Apps } from "./pages/Apps";
import { Posts } from "./pages/Posts";
import { Releases } from "./pages/Releases";
import { Settings } from "./pages/Settings";
import { Status } from "./pages/Status";
import { Studio } from "./pages/Studio";
import { Today } from "./pages/Today";
import { usePulse } from "./state/pulse";

function Splash({ done }: { done: boolean }) {
  return (
    <AnimatePresence>
      {!done && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-bg" exit={{ opacity: 0 }} transition={{ duration: 0.32 }}>
          <motion.div initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={softSpring}>
            <Logo size={92} animated />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConnectionBanner() {
  const { snapshot, loaded, refresh, setLoginOpen, editor } = usePulse();
  const [busy, setBusy] = useState(false);
  if (!loaded || !inTauri) return null;
  const retry = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
  };
  if (snapshot.setup_required) {
    return (
      <div className="card mb-6 flex items-center gap-3.5 p-4">
        <span className="squircle grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <ServerCog size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Nexora Pulse se prépare</p>
          <p className="text-[13px] text-muted">Le serveur est en ligne, mais ses données ne sont pas encore installées.</p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => void retry()}>
          <RotateCw size={13} /> Réessayer
        </Button>
        {!editor && (
          <Button variant="ghost" onClick={() => setLoginOpen(true)}>
            Studio
          </Button>
        )}
      </div>
    );
  }
  if (!snapshot.online) {
    return (
      <div className="card mb-6 flex items-center gap-3.5 p-4">
        <span className="squircle grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
          <WifiOff size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Tu es hors ligne</p>
          <p className="text-[13px] text-muted">{snapshot.fetched_at ? `Dernières données reçues ${formatRelative(snapshot.fetched_at)}.` : "Impossible de joindre le serveur Nexora."}</p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => void retry()}>
          <RotateCw size={13} /> Réessayer
        </Button>
      </div>
    );
  }
  return null;
}

function Toasts() {
  const { toasts } = usePulse();
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={spring}
            className="glass flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium shadow-[var(--shadow-hover)]"
          >
            {toast.tone === "ok" ? <CircleCheck size={15} className="shrink-0 text-[var(--green)]" /> : <CircleAlert size={15} className="shrink-0 text-[var(--red)]" />}
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const PAGES = { today: Today, posts: Posts, releases: Releases, status: Status, apps: Apps, settings: Settings, studio: Studio };

export default function App() {
  const { page, appId, loaded } = usePulse();
  const [splashDone, setSplashDone] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const Current = PAGES[page];

  useEffect(() => {
    const frame = requestAnimationFrame(() => void api.windowReady());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => setSplashDone(true), reduced ? 0 : 650);
    return () => window.clearTimeout(timer);
  }, [loaded, reduced]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page, appId]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="main-pane relative min-w-0 flex-1">
        <TitleBar />
        <div ref={scroller} className="scroll h-full">
          <div className="mx-auto max-w-[1180px] px-10 pt-14 pb-12">
            <ConnectionBanner />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${page}-${appId ?? ""}`}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.17, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <Current />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
      <ArticleSheet />
      <LoginSheet />
      <Toasts />
      <Splash done={splashDone} />
    </div>
  );
}
