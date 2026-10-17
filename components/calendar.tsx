"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGarden } from "./garden-provider";
import { PageHeading, Badge, Empty, Modal } from "./ui";
import { addDays, formatDate, projections, taskStatus } from "@/lib/dates";
import { activityLabel, activityEmoji } from "@/lib/types";
type Event = {
  id: string;
  date: string;
  name: string;
  plantId: string;
  activity: string;
  status: "Upcoming" | "Due Today" | "Overdue" | "Completed" | "Skipped";
  estimated: boolean;
};
function monday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export function CalendarView() {
  const { data, today } = useGarden();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [focus, setFocus] = useState(today);
  const [day, setDay] = useState<string | null>(null);
  const [plantFilter, setPlantFilter] = useState(""),
    [activityFilter, setActivityFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("");
  const monthStart = `${focus.slice(0, 7)}-01`;
  const from = mode === "month" ? monday(monthStart) : monday(focus);
  const length = mode === "month" ? 42 : 7;
  const to = addDays(from, length - 1);
  const events = useMemo(() => {
    const entries: Event[] = [];
    data.schedules
      .filter((s) => s.active && !s.archived_at)
      .forEach((s) => {
        const plant = data.plants.find(
          (p) => p.id === s.plant_id && !p.archived_at,
        );
        if (!plant) return;
        for (const p of projections(s, from, to, today))
          entries.push({
            id: `${s.id}:${p.date}`,
            date: p.date,
            name: plant.name,
            plantId: plant.id,
            activity: activityLabel(s),
            status: taskStatus(p.date, today),
            estimated: p.estimated,
          });
      });
    for (const h of data.history.filter(
      (h) => h.action_date >= from && h.action_date <= to,
    ))
      entries.push({
        id: h.id,
        date: h.action_date,
        plantId: h.plant_id,
        name:
          data.plants.find((p) => p.id === h.plant_id)?.name ??
          "Archived plant",
        activity: h.activity,
        status: h.status,
        estimated: false,
      });
    return entries
      .filter(
        (e) =>
          (!plantFilter || e.plantId === plantFilter) &&
          (!activityFilter || e.activity === activityFilter) &&
          (!statusFilter || e.status === statusFilter),
      )
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
      );
  }, [data, from, to, today, plantFilter, activityFilter, statusFilter]);
  const days = Array.from({ length }, (_, i) => addDays(from, i));
  function shift(direction: number) {
    if (mode === "week") {
      setFocus(addDays(focus, 7 * direction));
      return;
    }
    const d = new Date(`${monthStart}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + direction);
    setFocus(d.toISOString().slice(0, 10));
  }
  const eventCard = (e: Event) => (
    <span
      key={e.id}
      className={`calendar-event care-${e.activity.toLowerCase()} event-${e.status.toLowerCase().replaceAll(" ", "-")} ${e.estimated ? "estimated" : ""}`}
    >
      <span>{e.name}</span>
      <small>
        {activityEmoji(e.activity)} {e.activity}
        {e.estimated ? " · Est." : ` · ${e.status}`}
      </small>
    </span>
  );
  return (
    <>
      <PageHeading
        eyebrow="A RHYTHM FOR YOUR GARDEN"
        title="Care calendar"
        description="A little planning. A whole lot of growing."
      />
      <div className="filter-bar calendar-filters">
        <label className="field">
          Plant
          <select
            aria-label="Plant"
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
          >
            <option value="">All plants</option>
            {data.plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Activity
          <select
            aria-label="Activity"
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
          >
            <option value="">All activities</option>
            {Array.from(
              new Set([
                ...data.schedules.map(activityLabel),
                ...data.history.map((h) => h.activity),
              ]),
            ).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {["Upcoming", "Due Today", "Overdue", "Completed", "Skipped"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <button
          className="text-link"
          onClick={() => {
            setPlantFilter("");
            setActivityFilter("");
            setStatusFilter("");
          }}
        >
          Clear filters
        </button>
      </div>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="calendar-title">
            <h2>{formatDate(focus, { month: "long", year: "numeric" })}</h2>
            <div className="calendar-navigation">
              <button
                className="icon-button"
                aria-label={`Previous ${mode}`}
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="button secondary small"
                onClick={() => setFocus(today)}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label={`Next ${mode}`}
                onClick={() => shift(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="segmented">
            <button
              className={mode === "month" ? "selected" : ""}
              aria-pressed={mode === "month"}
              onClick={() => setMode("month")}
            >
              Month
            </button>
            <button
              className={mode === "week" ? "selected" : ""}
              aria-pressed={mode === "week"}
              onClick={() => setMode("week")}
            >
              Week
            </button>
          </div>
        </div>
        <p className="calendar-mobile-hint">
          Tap a date for activities. Future estimates may shift.
        </p>
        <div className="calendar-scroll">
          <div className={`calendar-grid ${mode}`}>
            <div className="weekdays">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-days">
              {days.map((date) => {
                const es = events.filter((e) => e.date === date);
                return (
                  <button
                    key={date}
                    onClick={() => setDay(date)}
                    aria-label={`${formatDate(date, { weekday: "long", month: "long", day: "numeric" })}, ${es.length} activities`}
                    className={`calendar-day ${date === today ? "is-today" : ""} ${date.slice(0, 7) !== focus.slice(0, 7) && mode === "month" ? "outside-month" : ""}`}
                  >
                    <span className="day-number">{Number(date.slice(-2))}</span>
                    <span className="week-day-label">
                      {formatDate(date, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {es.length > 0 && (
                      <span className="mobile-day-summary" aria-hidden="true">
                        <strong>{es.length}</strong>
                        <span className="calendar-markers">
                          {es.slice(0, 3).map((e) => (
                            <span
                              key={e.id}
                              className={`calendar-marker marker-${e.status.toLowerCase().replaceAll(" ", "-")} ${e.estimated ? "marker-estimated" : ""}`}
                            />
                          ))}
                        </span>
                      </span>
                    )}
                    {es.length === 0 && (
                      <span className="week-empty">No activities</span>
                    )}
                    <span className="day-events">
                      {es.slice(0, mode === "week" ? 20 : 2).map(eventCard)}
                      {es.length > (mode === "week" ? 20 : 2) && (
                        <small className="more-events">
                          +{es.length - (mode === "week" ? 20 : 2)} more
                        </small>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="calendar-legend">
          <Badge status="Upcoming" />
          <Badge status="Due Today" />
          <Badge status="Overdue" />
          <Badge status="Completed" />
          <Badge status="Skipped" />
        </div>
      </section>
      <p className="hint calendar-disclaimer">
        Est. = projected recurrence, not a committed task. Future dates shift
        after care is recorded. History is shown on the day the action happened.
        One overdue occurrence stays outstanding until completed or skipped.
      </p>
      {day && (
        <Modal
          title={formatDate(day, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          onClose={() => setDay(null)}
        >
          {events.filter((e) => e.date === day).length ? (
            <div className="day-detail">
              {events
                .filter((e) => e.date === day)
                .map((e) => (
                  <div className="day-detail-row" key={e.id}>
                    <div>
                      <strong>{e.name}</strong>
                      <p className="muted">
                        {activityEmoji(e.activity)} {e.activity}
                        {e.estimated ? " · Estimated recurrence" : ""}
                      </p>
                    </div>
                    <Badge status={e.status} />
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="A quiet day">
              <p>Nothing scheduled. Enjoy watching things grow.</p>
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
