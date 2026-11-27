"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
  const onTime = completed.filter((h) => h.action_date <= h.due_date).length;
  const counts = new Map<string, number>();
  for (const event of completed)
    counts.set(event.activity, (counts.get(event.activity) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const peak = groups[0]?.[1] ?? 1;
  const perDay = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return {
      date,
      count: completed.filter((h) => h.action_date === date).length,
    };
  });
  const dayPeak = Math.max(1, ...perDay.map((d) => d.count));
  const perPlant = new Map<string, number>();
  for (const event of completed)
    perPlant.set(event.plant_id, (perPlant.get(event.plant_id) ?? 0) + 1);
  const topPlants = [...perPlant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({
      name: data.plants.find((p) => p.id === id)?.name ?? "Archived plant",
      n,
    }));
  const base = demo ? "/demo" : "";
  const totals = [
    { label: "Care completed", value: completed.length },
    { label: "Skipped", value: entries.length - completed.length },
    {
      label: "On time",
      value: completed.length
        ? `${Math.round((onTime * 100) / completed.length)}%`
        : "—",
    },
    {
      label: "Plants cared for",
      value: new Set(completed.map((e) => e.plant_id)).size,
    },
  ];
  return (
    <>
      <PageHeading
        title="Care analytics"
        description="How consistently your plants are getting care."
        action={
          <select
            className="period-select"
            aria-label="Reporting period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        }
      />
      <dl className="metric-row">
        {totals.map((t) => (
          <div className="metric" key={t.label}>
            <dt>{t.label}</dt>
            <dd>{t.value}</dd>
          </div>
        ))}
      </dl>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <h2>Care completed per day</h2>
          <span className="muted small">
            {formatDate(from)} – {formatDate(today)}
          </span>
        </div>
        <div
          className="day-bars"
          role="img"
          aria-label="Completed care per day"
        >
          {perDay.map((d) => (
            <div
              className="day-bar"
              key={d.date}
              data-tip={`${formatDate(d.date)} · ${d.count} completed`}
            >
              <i
                style={{
                  height: d.count
                    ? `${Math.max(6, (d.count * 100) / dayPeak)}%`
                    : 0,
                }}
              />
            </div>
          ))}
        </div>
        <div className="day-axis" aria-hidden="true">
          <span>{formatDate(from)}</span>
          <span>{formatDate(today)}</span>
        </div>
        <table className="sr-only">
          <caption>Completed care per day</caption>
          <tbody>
            {perDay.map((d) => (
              <tr key={d.date}>
                <th scope="row">{d.date}</th>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="analytics-columns">
        <section className="panel chart-panel">
          <h2>By activity</h2>
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
            <p className="muted">Your first completed care will appear here.</p>
          )}
        </section>
        <section className="panel chart-panel">
          <h2>Most cared for</h2>
          {topPlants.length ? (
            <ol className="top-plants">
              {topPlants.map((p) => (
                <li key={p.name}>
                  <span>{p.name}</span>
                  <strong>{p.n}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No care recorded in this period.</p>
          )}
          <Link href={`${base}/history`} className="text-link">
            Full care history <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}
