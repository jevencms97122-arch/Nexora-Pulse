import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorText, onEvent } from "../lib/api";
import { postIsLive, releaseIsLive } from "../lib/format";
import type { AppInfo, Editor, Page, Post, Prefs, PulseApp, Release, Snapshot, UpdateInfo } from "../lib/types";

const EMPTY: Snapshot = { apps: [], posts: [], releases: [], incidents: [], online: false, live: false, setup_required: false, fetched_at: "" };
const DEFAULT_PREFS: Prefs = { notifications: true, muted_apps: [], close_to_tray: true, autostart: false };

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

interface PulseValue {
  snapshot: Snapshot;
  loaded: boolean;
  /** Published content only, even for a signed-in editor. */
  posts: Post[];
  releases: Release[];
  apps: PulseApp[];
  appById: (id: string) => PulseApp | undefined;
  editor: Editor | null;
  info: AppInfo | null;
  prefs: Prefs;
  update: UpdateInfo | null;
  page: Page;
  appId: string | null;
  postId: string | null;
  loginOpen: boolean;
  toasts: Toast[];
  go: (page: Page, appId?: string | null) => void;
  openPost: (id: string | null) => void;
  setLoginOpen: (open: boolean) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  refresh: () => Promise<void>;
  /** Runs an admin action, applies the returned data and reports the result. */
  run: (action: () => Promise<Snapshot>, success?: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  savePrefs: (next: Prefs) => Promise<void>;
  setUpdate: (next: UpdateInfo) => void;
}

const Ctx = createContext<PulseValue | null>(null);

export function PulseProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [page, setPage] = useState<Page>("today");
  const [appId, setAppId] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = nextToast.current++;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const syncSession = useCallback(() => {
    api.session().then(setEditor).catch(() => setEditor(null));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cached, nextInfo, nextPrefs, nextUpdate] = await Promise.all([api.snapshot(), api.appInfo(), api.getPrefs(), api.updateStatus()]);
      if (!alive) return;
      setSnapshot(cached);
      setInfo(nextInfo);
      setPrefs(nextPrefs);
      setUpdate(nextUpdate);
      document.documentElement.classList.toggle("mica", nextInfo.mica);
      syncSession();
      const fresh = await api.refresh();
      if (!alive) return;
      setSnapshot(fresh);
      setLoaded(true);
    })().catch(() => setLoaded(true));

    const stops = [
      onEvent<Snapshot>("pulse-snapshot", (next) => {
        setSnapshot(next);
        setLoaded(true);
        syncSession();
      }),
      onEvent<boolean>("pulse-live", (live) => setSnapshot((s) => ({ ...s, live }))),
      onEvent<UpdateInfo>("pulse-update", setUpdate),
    ];
    return () => {
      alive = false;
      stops.forEach((stop) => stop());
    };
  }, [syncSession]);

  const go = useCallback((next: Page, nextApp: string | null = null) => {
    setPage(next);
    setAppId(nextApp);
  }, []);

  const refresh = useCallback(async () => {
    setSnapshot(await api.refresh());
  }, []);

  const run = useCallback(
    async (action: () => Promise<Snapshot>, success?: string) => {
      try {
        setSnapshot(await action());
        if (success) toast(success);
        syncSession();
        return true;
      } catch (error) {
        toast(errorText(error), "error");
        syncSession();
        return false;
      }
    },
    [syncSession, toast],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const who = await api.login(email, password);
      setEditor(who);
      setSnapshot(await api.snapshot());
      toast("Connecté au Studio");
    },
    [toast],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setEditor(null);
    setPage((current) => (current === "studio" ? "today" : current));
    setSnapshot(await api.snapshot());
  }, []);

  const savePrefs = useCallback(
    async (next: Prefs) => {
      setPrefs(next);
      try {
        setPrefs(await api.setPrefs(next));
      } catch (error) {
        toast(errorText(error), "error");
        setPrefs(await api.getPrefs());
      }
    },
    [toast],
  );

  const value = useMemo<PulseValue>(() => {
    const apps = snapshot.apps.filter((a) => a.visible);
    const posts = snapshot.posts
      .filter(postIsLive)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publish_at.localeCompare(a.publish_at));
    const releases = snapshot.releases.filter(releaseIsLive).sort((a, b) => b.released_at.localeCompare(a.released_at));
    return {
      snapshot,
      loaded,
      posts,
      releases,
      apps,
      appById: (id) => snapshot.apps.find((a) => a.id === id),
      editor,
      info,
      prefs,
      update,
      page,
      appId,
      postId,
      loginOpen,
      toasts,
      go,
      openPost: setPostId,
      setLoginOpen,
      toast,
      refresh,
      run,
      login,
      logout,
      savePrefs,
      setUpdate,
    };
  }, [snapshot, loaded, editor, info, prefs, update, page, appId, postId, loginOpen, toasts, go, toast, refresh, run, login, logout, savePrefs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePulse() {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePulse must be used inside PulseProvider");
  return value;
}
