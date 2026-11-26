"use client";
import Link from "next/link";
import { useState } from "react";
import { useGarden } from "./garden-provider";
import { PageHeading } from "./ui";
import { addDays, formatDate } from "@/lib/dates";

export function CareAnalytics() {
  const { data, today, demo } = useGarden();
  const [days, setDays] = useState(14);
  const from = addDays(today, 1 - days);
  const entries = data.history.filter(
    (h) => h.action_date >= from && h.action_date <= today,
  );
  const completed = entries.filter((h) => h.status === "Completed");
  const counts = new Map<string, number>();
  for (const event of completed)
    counts.set(event.activity, (counts.get(event.activity) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const peak = groups[0]?.[1] ?? 1;
  const base = demo ? "/demo" : "";
  return (
    <>
      <PageHeading
        title="Care analytics"
        description="A summary of the care you recorded."
      />
      <section className="panel care-analytics">
        <div className="panel-heading">
          <h2>
            {formatDate(from)} – {formatDate(today)}
          </h2>
          <select
            aria-label="Reporting period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <dl className="care-totals">
          <div>
            <dt>Care actions completed</dt>
            <dd>{completed.length}</dd>
          </div>
          <div>
            <dt>Tasks skipped</dt>
            <dd>{entries.length - completed.length}</dd>
          </div>
          <div>
            <dt>Plants cared for</dt>
            <dd>{new Set(completed.map((e) => e.plant_id)).size}</dd>
          </div>
        </dl>
        <h3>Completed care by activity</h3>
        {groups.length ? (
          <ul className="care-bars">
            {groups.map(([activity, count]) => (
              <li key={activity}>
                <span>{activity}</span>
                <div aria-hidden="true">
                  <i style={{ width: `${(count * 100) / peak}%` }} />
                </div>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Your first completed action will appear here.</p>
        )}
        <Link href={`${base}/history`} className="text-link">
          View care history
        </Link>
      </section>
    </>
  );
}
