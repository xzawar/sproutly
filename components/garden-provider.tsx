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
import { createDemo, DEMO_KEY, demoMutation } from "@/lib/demo";
import { todayIn } from "@/lib/dates";
import type { Mutation, WorkspaceData } from "@/lib/types";
interface GardenContext {
  data: WorkspaceData;
  demo: boolean;
  today: string;
  busy: boolean;
  run: (m: Mutation) => Promise<boolean>;
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
  const [ready, setReady] = useState(demo);
  const dataRef = useRef(initialData);
  const syncLock = useRef(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const pending = false;
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
      const cursor = dataRef.current.cursor;
      const r = await fetch(
        `/api/sync${cursor === undefined ? "" : `?cursor=${cursor}`}`,
        { cache: "no-store" },
      );
      if (!r.ok)
        throw Error(
          "Could not refresh your garden. Your cached view has not changed.",
        );
      const result = await r.json();
      let next: WorkspaceData;
      if (cursor === undefined) next = result;
      else {
        next = {
          ...dataRef.current,
          profile: result.profile,
          cursor: result.cursor,
        };
        if (next.profile.role !== "admin") next.users = [];
        for (const key of [
          "plants",
          "schedules",
          "history",
          "categories",
          "users",
          "growth",
          "photos",
        ] as const) {
          const removed = new Set(result.deleted[key] ?? []);
          const fresh = new Map(
            (result.rows[key] ?? []).map((row: { id: string }) => [
              row.id,
              row,
            ]),
          );
          const merged = [
            ...next[key].filter(
              (row) => !removed.has(row.id) && !fresh.has(row.id),
            ),
            ...fresh.values(),
          ];
          Object.assign(next, { [key]: merged });
        }
      }
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
  }, [cacheKey, demo]);
  useEffect(() => {
    if (demo) return;
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
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
    // Initial profile is a server-verified identity. Never read another user's cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, demo, sync]);
  useEffect(() => {
    if (demo) {
      try {
        const stored = localStorage.getItem(DEMO_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed.profile &&
            Array.isArray(parsed.plants) &&
            Array.isArray(parsed.schedules) &&
            Array.isArray(parsed.history) &&
            Array.isArray(parsed.categories) &&
            Array.isArray(parsed.users) &&
            Array.isArray(parsed.growth) &&
            Array.isArray(parsed.photos)
          )
            setDemoData(parsed);
        }
      } catch {
        localStorage.removeItem(DEMO_KEY);
      }
    }
  }, [demo]);
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
  const run = async (m: Mutation) => {
    if (saving || pending) return false;
    if (!demo && !navigator.onLine) {
      notify("You’re offline. Reconnect before making changes.", true);
      return false;
    }
    setSaving(true);
    try {
      if (demo) {
        const next = demoMutation(demoData, m);
        localStorage.setItem(DEMO_KEY, JSON.stringify(next));
        setDemoData(next);
      } else {
        const result = await mutate(m);
        if (!result.ok) {
          notify(result.error, true);
          return false;
        }
        try {
          await sync();
        } catch {
          notify(
            "Saved successfully. Refresh is pending; reconnect to see the update.",
          );
          return true;
        }
      }
      notify(
        m.kind === "task.resolve"
          ? m.payload.status === "Completed"
            ? "Care recorded. Next date updated."
            : "Task skipped. Next date updated."
          : "Changes saved.",
      );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save changes.", true);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    const next = createDemo();
    setDemoData(next);
    localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    notify("Demo garden reset.");
  };
  return (
    <Context.Provider
      value={{
        data,
        demo,
        today: todayIn(data.profile.timezone, now),
        busy: saving || pending,
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
