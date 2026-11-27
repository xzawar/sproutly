"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sync server refreshes and an explicitly client-only demo store */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { mutate } from "@/app/actions";
import { DEMO_KEY } from "@/lib/demo";
import { initializeDemo, readDemo, writeDemo } from "@/lib/demo-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { todayIn } from "@/lib/dates";
import { refreshWorkspace } from "@/lib/workspace-sync";
import type { Mutation, WorkspaceData } from "@/lib/types";
interface GardenContext {
  data: WorkspaceData;
  demo: boolean;
  today: string;
  busy: boolean;
  run: (m: Mutation, onCreated?: (id: string) => void) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  reset: () => void;
  errorMessage: string | null;
  clearError: () => void;
}
const Context = createContext<GardenContext | null>(null);
export function GardenProvider({
  initialData,
  demo = false,
  children,
}: {
  initialData: WorkspaceData;
  demo?: boolean;
  children: ReactNode;
}) {
  const [demoData, setDemoData] = useState(initialData);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(initialData);
  const syncLock = useRef(false);
  const session = useRef<string | null>(initialData.profile.id);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const writeLock = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const data = demoData;
  const cacheKey = `sproutly-cache:${initialData.profile.id}`;
  const sync = useCallback(async () => {
    if (demo || !navigator.onLine) return;
    while (syncLock.current)
      await new Promise((resolve) => setTimeout(resolve, 25));
    if (!navigator.onLine) return;
    syncLock.current = true;
    try {
      if (session.current !== initialData.profile.id) return;
      const next = await refreshWorkspace(dataRef.current, async (cursor) => {
        const r = await fetch(
          `/api/sync${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw Error("Could not refresh your garden.");
        return r.json();
      });
      if (session.current !== initialData.profile.id) return;
      dataRef.current = next;
      setDemoData(next);
      setReady(true);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {
        /* memory cache remains available */
      }
    } finally {
      syncLock.current = false;
    }
  }, [cacheKey, demo, initialData.profile.id]);
  useEffect(() => {
    if (demo) return;
    session.current = initialData.profile.id;
    dataRef.current = initialData;
    setDemoData(initialData);
    setReady(false);
    try {
      const stored = sessionStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed.profile?.id === initialData.profile.id &&
          Array.isArray(parsed.growth) &&
          Array.isArray(parsed.photos)
        ) {
          dataRef.current = parsed;
          setDemoData(parsed);
          setReady(true);
        }
      }
    } catch {
      sessionStorage.removeItem(cacheKey);
    }
    void sync().catch(() => {
      setReady(true);
      notify(
        "Unable to refresh. Check your connection and database setup.",
        true,
      );
    });
    const refresh = () => void sync().catch(() => {});
    let burst: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      clearTimeout(burst);
      burst = setTimeout(refresh, 80);
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(cacheKey);
      channel.current.onmessage = invalidate;
    }
    const db = supabaseBrowser();
    const live = db
      .channel(`garden:${initialData.profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sync_events" },
        invalidate,
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") invalidate();
      });
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      session.current = null;
      clearInterval(timer);
      clearTimeout(burst);
      channel.current?.close();
      channel.current = null;
      void db.removeChannel(live);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
    // Initial profile is a server-verified identity. Never read another user's cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, demo, sync]);
  useEffect(() => {
    if (!demo) return;
    const refresh = () => {
      try {
        const latest = readDemo(initialData);
        dataRef.current = latest;
        setDemoData(latest);
      } catch {
        /* The initial in-memory demo is still readable. */
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEMO_KEY || event.key === null) refresh();
    };
    let active = true;
    void initializeDemo(initialData)
      .then((latest) => {
        if (!active) return;
        dataRef.current = latest;
        setDemoData(latest);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
    };
  }, [demo, initialData]);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(t);
  }, [demo]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const clearError = useCallback(() => setToast(null), []);
  const run = async (m: Mutation, onCreated?: (id: string) => void) => {
    if (writeLock.current) return false;
    if (!demo && !navigator.onLine) {
      notify("You’re offline. Reconnect before making changes.", true);
      return false;
    }
    writeLock.current = true;
    setSaving(true);
    try {
      let createdId: string | undefined;
      if (demo) {
        const result = await writeDemo(dataRef.current, m);
        dataRef.current = result.data;
        setDemoData(result.data);
        createdId = result.createdId;
      } else {
        const result = await mutate(m);
        if (!result.ok) {
          notify(result.error, true);
          return false;
        }
        createdId = result.createdId;
        channel.current?.postMessage("changed");
        try {
          await sync();
        } catch {
          notify(
            "Saved successfully. Refresh is pending; reconnect to see the update.",
          );
          if (createdId) onCreated?.(createdId);
          return true;
        }
      }
      if (createdId) onCreated?.(createdId);
      notify(
        m.kind === "task.resolve"
          ? m.payload.status === "Completed"
            ? "Care recorded. Next date updated."
            : "Task skipped. Next date updated."
          : m.kind === "care.record"
            ? "Care recorded."
            : "Changes saved.",
      );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save changes.", true);
      return false;
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!demo || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    try {
      const { data: next } = await writeDemo(dataRef.current);
      dataRef.current = next;
      setDemoData(next);
      notify("Demo garden reset.");
    } catch {
      notify("Could not save the demo garden.", true);
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        demo,
        today: todayIn(data.profile.timezone, now),
        busy: saving,
        run,
        notify,
        reset,
        errorMessage: toast?.error ? toast.message : null,
        clearError,
      }}
    >
      {ready ? (
        children
      ) : (
        <div className="loading-screen" role="status">
          🌱 Opening Sproutly…
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.message}
          <button aria-label="Dismiss message" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useGarden() {
  const c = useContext(Context);
  if (!c) throw Error("GardenProvider is required");
  return c;
}
