"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useGarden } from "./garden-provider";
import { useWeather } from "./weather";
import { buildGardenContext, ruleBrief } from "@/lib/ai-context";

export const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

type Brief = { text: string; source: "ai" | "rules" };

export function DailyBrief() {
  const { data, demo, today } = useGarden();
  const { weather, place, loading: weatherLoading } = useWeather();
  const base = demo ? "/demo" : "";
  const context = useMemo(
    () => buildGardenContext(data, today, weather, place),
    [data, today, weather, place],
  );
  // Weather refreshes every few minutes; only a change in what the brief says matters.
  const key = useMemo(() => {
    const { weather: w, ...rest } = context;
    return `sproutly-brief:${data.profile.id}:${hash(
      JSON.stringify({
        ...rest,
        weather: w && { ...w, temperature: 0, humidity: 0 },
      }),
    )}`;
  }, [context, data.profile.id]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(key);

  const load = useCallback(
    async (force = false) => {
      latest.current = key;
      if (!force) {
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            setBrief(JSON.parse(cached));
            return;
          }
        } catch {
          /* no cache */
        }
      }
      setBusy(true);
      try {
        const r = await fetch("/api/ai/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        const body = await r.json();
        if (!r.ok || typeof body.text !== "string") throw Error();
        const next: Brief = { text: body.text, source: body.source };
        if (latest.current !== key) return;
        setBrief(next);
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* memory only */
        }
      } catch {
        if (latest.current === key)
          setBrief({ text: ruleBrief(context), source: "rules" });
      } finally {
        if (latest.current === key) setBusy(false);
      }
    },
    [key, context],
  );

  useEffect(() => {
    if (weatherLoading && !weather) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [load, weatherLoading, weather]);

  return (
    <section className="brief" aria-live="polite" aria-busy={busy}>
      <div className="brief-head">
        <span className="brief-badge">
          <Sparkles size={15} aria-hidden="true" />
          {brief?.source === "ai" ? "AI daily brief" : "Daily brief"}
        </span>
        <button
          className="icon-button ghost"
          onClick={() => void load(true)}
          disabled={busy}
          aria-label="Refresh brief"
          title="Refresh brief"
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
        </button>
      </div>
      {brief ? (
        <p className="brief-text">{brief.text}</p>
      ) : (
        <div className="brief-skeleton" aria-label="Writing your brief">
          <span />
          <span />
        </div>
      )}
      <div className="brief-foot">
        <Link href={`${base}/assistant`} className="text-link">
          <MessageCircle size={15} /> Ask the plant assistant
        </Link>
        {!place && (
          <Link href={`${base}/weather`} className="text-link muted-link">
            Add your city for rain tips
          </Link>
        )}
      </div>
    </section>
  );
}
