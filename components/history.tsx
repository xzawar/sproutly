"use client";
import Link from "next/link";
import { useGarden } from "./garden-provider";
import { Badge, Empty } from "./ui";
import { formatDate } from "@/lib/dates";
import type { History } from "@/lib/types";
export function HistoryList({
  items,
  compact = false,
}: {
  items: History[];
  compact?: boolean;
}) {
  const { data, demo } = useGarden();
  const base = demo ? "/demo" : "";
  if (!items.length)
    return (
      <Empty title="Your care story starts here">
        <p>Completed and skipped activities will appear here.</p>
      </Empty>
    );
  return (
    <div className="history-list">
      {[...items]
        .sort(
          (a, b) =>
            b.action_date.localeCompare(a.action_date) ||
            b.created_at.localeCompare(a.created_at),
        )
        .map((h) => {
          const plant = data.plants.find((p) => p.id === h.plant_id);
          return (
            <div className="history-row" key={h.id}>
              <div className="history-date">
                <strong>{formatDate(h.action_date, { day: "numeric" })}</strong>
                <span>
                  {formatDate(h.action_date, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="history-content">
                <Link
                  className="task-name"
                  href={`${base}/plants/${h.plant_id}`}
                >
                  {plant?.name ?? "Archived plant"}
                  {plant?.archived_at ? " · archived" : ""}
                </Link>
                <span className="muted">
                  {h.activity}
                  {!compact
                    ? ` · Due ${formatDate(h.due_date, { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                </span>
                {h.notes && !compact && (
                  <p className="history-note">{h.notes}</p>
                )}
              </div>
              <Badge status={h.status} />
            </div>
          );
        })}
    </div>
  );
}
