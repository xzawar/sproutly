"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Droplets,
  Leaf,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
} from "lucide-react";
import { useGarden } from "./garden-provider";
import { ActivityIcon, Badge, Empty, Modal, PageHeading } from "./ui";
import { RestorePlant } from "./restore-plant";
import { TaskList } from "./tasks";
import { HistoryList } from "./history";
import { addDays, formatDate, frequency, taskStatus } from "@/lib/dates";
import { activityLabel, categoryEmoji, type Plant } from "@/lib/types";
export function Dashboard() {
  const { data, demo, today } = useGarden();
  const base = demo ? "/demo" : "";
  const plants = data.plants.filter((p) => !p.archived_at);
  const tasks = data.schedules
    .filter((s) => s.active && !s.archived_at)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const due = tasks.filter((s) => s.next_due_date === today);
  const overdue = tasks.filter((s) => s.next_due_date < today);
  const recent = data.history.filter(
    (h) =>
      h.status === "Completed" &&
      h.action_date >= addDays(today, -6) &&
      h.action_date <= today,
  );
  const stats = [
    {
      label: "Plants in your care",
      value: plants.length,
      icon: Leaf,
      sub: "A little greener, every day",
      link: "/plants",
    },
    {
      label: "Due today",
      value: due.length,
      icon: Droplets,
      sub: due.length
        ? "Ready for a little attention"
        : "All caught up for today",
      link: "/tasks?status=Due+Today",
    },
    {
      label: "Overdue tasks",
      value: overdue.length,
      icon: Clock3,
      sub: overdue.length
        ? "Let’s bring these up to date"
        : "Nothing left behind",
      link: "/tasks?status=Overdue",
    },
    {
      label: "Completed this week",
      value: recent.length,
      icon: Check,
      sub: "Small moments of care",
      link: "/history",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={formatDate(today, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }).toUpperCase()}
        title={`A good day to grow, ${data.profile.name.split(" ")[0]}.`}

        action={
          <Link className="button primary" href={`${base}/plants/new`}>
            <Plus size={18} /> Add plant
          </Link>
        }
      />
      <section className="garden-hero">
        <img
          src="/monstera.webp"
          alt="Lush monstera leaves in a simple ivory pot"
        />
        <div className="hero-copy">
          <h2>
            Small routines.
            <br />
            Thriving plants.
          </h2>
          <p>
            {due.length + overdue.length
              ? `You have ${due.length + overdue.length} ${due.length + overdue.length === 1 ? "task" : "tasks"} ready for your attention.`
              : "You’re all caught up."}
          </p>
          <Link href={`${base}/tasks`} className="text-link">
            See your care tasks <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <div className="stats-grid">
        {stats.map(({ label, value, icon: Icon, link }) => (
          <Link href={`${base}${link}`} className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value.toString().padStart(2, "0")}</strong>
            <span className="stat-foot">
              <ArrowDownRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Due & overdue</h2>
            </div>
            <Link className="text-link" href={`${base}/tasks`}>
              View all <ArrowRight size={16} />
            </Link>
          </div>
          <TaskList schedules={[...overdue, ...due]} compact />
        </section>
        <section className="panel week-panel">
          <div className="panel-heading">
            <div>
              <h2>Next 7 days</h2>
            </div>
            <CalendarDays size={19} />
          </div>
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(today, i);
              const count = tasks.filter(
                (t) => t.next_due_date === date,
              ).length;
              return (
                <Link
                  key={date}
                  href={`${base}/calendar`}
                  className={`week-date ${i === 0 ? "current" : ""}`}
                >
                  <span>{formatDate(date, { weekday: "narrow" })}</span>
                  <strong>{Number(date.slice(-2))}</strong>
                  <span
                    className={`week-dot ${count ? "has-tasks" : ""}`}
                    aria-label={`${count} tasks`}
                  />
                </Link>
              );
            })}
          </div>
          <div className="horizon-list">
            {tasks
              .filter((s) => s.next_due_date > today)
              .slice(0, 3)
              .map((s) => (
                <Link href={`${base}/plants/${s.plant_id}`} key={s.id}>
                  <ActivityIcon activity={s.activity} />
                  <div>
                    <strong>
                      {data.plants.find((p) => p.id === s.plant_id)?.name}
                    </strong>
                    <span>
                      {activityLabel(s)} · {formatDate(s.next_due_date)}
                    </span>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            {!tasks.some((s) => s.next_due_date > today) && (
              <p className="muted">No upcoming routines yet.</p>
            )}
          </div>
          <Link className="calendar-link" href={`${base}/calendar`}>
            Open calendar <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Recently cared for</h2>
          </div>
          <Link className="text-link" href={`${base}/history`}>
            Full history <ArrowRight size={16} />
          </Link>
        </div>
        <HistoryList
          items={[...data.history]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 3)}
          compact
        />
      </section>
    </>
  );
}
export function PlantsView() {
  const { data, demo } = useGarden();
  const base = demo ? "/demo" : "";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const plants = data.plants.filter(
    (p) =>
      Boolean(p.archived_at) === archived &&
      `${p.name} ${p.common_name} ${p.scientific_name}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!category || p.category_id === category),
  );
  return (
    <>
      <PageHeading
        title="My plants"

        action={
          <Link className="button primary" href={`${base}/plants/new`}>
            <Plus size={18} /> Add plant
          </Link>
        }
      />
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search plants by name"
            placeholder="Find a plant…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          Archived
        </label>
        <span className="muted results-count">
          {plants.length} {plants.length === 1 ? "plant" : "plants"}
        </span>
      </div>
      {plants.length ? (
        <div className="plants-grid">
          {plants.map((p) => (
            <Link
              href={`${base}/plants/${p.id}`}
              className="plant-card"
              key={p.id}
            >
              {p.display_image ? (
                <div className="plant-photo">
                  <img
                    src={p.display_image}
                    alt={p.name}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement?.classList.add(
                        "image-unavailable",
                      );
                    }}
                  />
                </div>
              ) : (
                <div className="plant-no-photo">
                  <Leaf size={30} />
                  <span>No photo yet</span>
                </div>
              )}
              <div className="plant-card-copy">
                <div className="plant-card-heading">
                  <h2>{p.name}</h2>
                  <ChevronRight size={17} />
                </div>
                <p className="scientific-name">
                  {p.scientific_name || p.common_name || ""}
                </p>
                <div className="plant-meta">
                  <span>
                    <MapPin size={14} />
                    {p.location || "No location"}
                  </span>
                  <span>
                    {categoryEmoji(
                      data.categories.find((c) => c.id === p.category_id)
                        ?.name ?? "",
                    )}{" "}
                    {data.categories.find((c) => c.id === p.category_id)
                      ?.name ?? "Uncategorized"}
                  </span>
                </div>
                <div className="plant-care-preview">
                  <span>
                    ☀️ {p.sunlight} ·{" "}
                    {p.environment === "outdoor" ? "Outdoors" : "Indoors"}
                  </span>
                  {["Water", "Fertilize"].map((a) => {
                    const next = data.schedules
                      .filter(
                        (s) =>
                          s.plant_id === p.id &&
                          s.activity === a &&
                          s.active &&
                          !s.archived_at,
                      )
                      .sort((a, b) =>
                        a.next_due_date.localeCompare(b.next_due_date),
                      )[0];
                    return (
                      <span key={a}>
                        {a === "Water" ? "💧" : "🌻"} {a}:{" "}
                        <strong>
                          {next
                            ? formatDate(next.next_due_date)
                            : "Not scheduled"}
                        </strong>
                      </span>
                    );
                  })}
                </div>
                {p.archived_at && <Badge status="Archived" />}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={
              query || category
                ? "No plants found"
                : archived
                  ? "No archived plants"
                  : "Let’s make room for green"
            }
          >
            <p>
              {query || category
                ? "Try another name or category."
                : archived
                  ? "Plants you archive remain here with their care history."
                  : "Add your first plant and give it a routine."}
            </p>
            {!archived && (
              <Link className="button primary" href={`${base}/plants/new`}>
                <Plus size={17} /> Add plant
              </Link>
            )}
          </Empty>
        </section>
      )}
    </>
  );
}
export function PlantDetail({ plant }: { plant: Plant }) {
  const { data, demo, today, run, busy } = useGarden();
  const base = demo ? "/demo" : "";
  const [confirm, setConfirm] = useState<"plant" | string | null>(null);
  const schedules = data.schedules.filter(
    (s) => s.plant_id === plant.id && !s.archived_at,
  );
  const history = data.history.filter((h) => h.plant_id === plant.id);
  return (
    <>
      <Link className="back-link" href={`${base}/plants`}>
        ← Back to plants
      </Link>
      <PageHeading
        eyebrow={
          data.categories.find((c) => c.id === plant.category_id)?.name ??
          "YOUR PLANT"
        }
        title={plant.name}
        description={plant.scientific_name || plant.common_name || ""}
        action={
          plant.archived_at ? (
            <RestorePlant plant={plant} />
          ) : (
            <>
              <Link
                className="button secondary"
                href={`${base}/plants/${plant.id}/edit`}
              >
                <Pencil size={16} /> Edit plant
              </Link>
              <button
                className="icon-button danger"
                aria-label="Archive plant"
                title="Archive plant"
                onClick={() => setConfirm("plant")}
              >
                <Trash2 size={18} />
              </button>
            </>
          )
        }
      />
      {plant.archived_at && (
        <div className="info-note">
          <Leaf size={18} />
          <p>
            This plant is archived. Its schedules have stopped, and its care
            history is preserved.
          </p>
        </div>
      )}
      <div className="plant-detail-grid">
        <section className="panel plant-overview">
          {plant.display_image && (
            <img
              className="detail-photo"
              src={plant.display_image}
              alt={plant.name}
            />
          )}
          <div className="plant-facts">
            <h2>At home</h2>
            <div className="fact">
              <MapPin size={18} />
              <div>
                <span>Location</span>
                <strong>{plant.location || "Not set"}</strong>
              </div>
            </div>
            <div className="fact">
              <Sun size={18} />
              <div>
                <span>Sunlight</span>
                <strong>{plant.sunlight}</strong>
              </div>
            </div>
            <div className="fact">
              <CalendarDays size={18} />
              <div>
                <span>Added</span>
                <strong>
                  {formatDate(plant.added_on, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
              </div>
            </div>
            {plant.common_name && (
              <div className="detail-text">
                <h3>Common name</h3>
                <p>{plant.common_name}</p>
              </div>
            )}
            {[
              ["Watering", plant.watering],
              ["Fertilizing", plant.fertilizing],
              ["Description", plant.description],
              ["Personal notes", plant.notes],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div className="detail-text" key={label}>
                  <h3>{label}</h3>
                  <p>{value}</p>
                </div>
              ))}
          </div>
        </section>
        <div className="plant-routines">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Care routines</h2>
              </div>
              {!plant.archived_at && (
                <Link
                  className="button secondary small"
                  href={`${base}/plants/${plant.id}/schedules/new`}
                >
                  <Plus size={16} /> Add routine
                </Link>
              )}
            </div>
            {!plant.archived_at && (
              <div className="quick-schedules">
                {["Water", "Fertilize"].map((a) => (
                  <Link
                    key={a}
                    className="button secondary"
                    href={`${base}/plants/${plant.id}/schedules/new?activity=${a}`}
                  >
                    {a === "Water"
                      ? "💧 Set watering schedule"
                      : "🌻 Set fertilizing schedule"}
                  </Link>
                ))}
              </div>
            )}
            {schedules.length ? (
              <div className="routine-list">
                {schedules.map((s) => (
                  <div className="routine-row" key={s.id}>
                    <ActivityIcon activity={s.activity} />
                    <div className="routine-content">
                      <strong>{activityLabel(s)}</strong>
                      <span className="muted">
                        {frequency(s)} ·{" "}
                        {s.active
                          ? `Next: ${formatDate(s.next_due_date)}`
                          : "Schedule ended"}
                      </span>
                      {s.notes && <p className="hint">{s.notes}</p>}
                    </div>
                    <Badge
                      status={
                        s.active ? taskStatus(s.next_due_date, today) : "Ended"
                      }
                    />
                    {!plant.archived_at && (
                      <div className="routine-actions">
                        <Link
                          className="icon-button"
                          aria-label={`Edit ${activityLabel(s)} schedule`}
                          href={`${base}/schedules/${s.id}/edit`}
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          className="icon-button danger"
                          onClick={() => setConfirm(s.id)}
                          aria-label={`Archive ${activityLabel(s)} schedule`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="Find your rhythm">
                <p>
                  Add watering, feeding, pruning or your own custom routine.
                </p>
              </Empty>
            )}
          </section>
          {schedules.some((s) => s.active) && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Care tasks</h2>
              </div>
              <TaskList
                schedules={schedules
                  .filter((s) => s.active)
                  .sort((a, b) =>
                    a.next_due_date.localeCompare(b.next_due_date),
                  )}
              />
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Care history</h2>
              <span className="muted">
                {history.length}{" "}
                {history.length === 1 ? "activity" : "activities"}
              </span>
            </div>
            <HistoryList items={history} />
          </section>
        </div>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "plant"
              ? "Archive this plant?"
              : "Archive this routine?"
          }
          onClose={() => !busy && setConfirm(null)}
        >
          <p className="modal-copy muted">
            {confirm === "plant"
              ? "The plant leaves your active collection and all its schedules stop."
              : "This schedule will stop generating tasks and reminders."}{" "}
            Previous care history will stay available. There is no restore
            control in this version.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep it
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({
                    kind:
                      confirm === "plant"
                        ? "plant.archive"
                        : "schedule.archive",
                    payload: { id: confirm === "plant" ? plant.id : confirm },
                  })
                )
                  setConfirm(null);
              }}
            >
              {busy ? "Archiving…" : "Archive"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function TasksView({
  initialStatus = "All",
}: {
  initialStatus?: string;
}) {
  const { data, today } = useGarden();
  const tabs = [
    "All",
    "Due Today",
    "Overdue",
    "Upcoming",
    "Completed",
    "Skipped",
  ];
  const [tab, setTab] = useState(
    tabs.includes(initialStatus) ? initialStatus : "All",
  );
  const [query, setQuery] = useState("");
  const matches = (plantId: string) =>
    data.plants
      .find((p) => p.id === plantId)
      ?.name.toLowerCase()
      .includes(query.toLowerCase());
  const schedules = data.schedules
    .filter(
      (s) =>
        s.active &&
        !s.archived_at &&
        matches(s.plant_id) &&
        (tab === "All" || taskStatus(s.next_due_date, today) === tab),
    )
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  return (
    <>
      <PageHeading title="Care tasks" />
      <div className="task-controls">
        <div className="tabs" role="tablist" aria-label="Task status">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tasks by plant"
            placeholder="Find a plant…"
          />
        </label>
      </div>
      <section className="panel" role="tabpanel" aria-label={`${tab} tasks`}>
        {tab === "Completed" || tab === "Skipped" ? (
          <HistoryList
            items={data.history.filter(
              (h) => h.status === tab && matches(h.plant_id),
            )}
          />
        ) : (
          <TaskList schedules={schedules} />
        )}
      </section>
      <p className="hint page-footnote">
        Tasks can be completed or skipped when due. Dates follow{" "}
        {data.profile.timezone}. Overdue occurrences stay open until you act.
      </p>
    </>
  );
}
export function HistoryView() {
  const { data } = useGarden();
  const [plant, setPlant] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const items = data.history.filter(
    (h) =>
      (!plant || h.plant_id === plant) &&
      (!status || h.status === status) &&
      (!from || h.action_date >= from) &&
      (!to || h.action_date <= to),
  );
  return (
    <>
      <PageHeading title="Care history" />
      <div className="filter-bar history-filters">
        <label className="filter-label">
          Plant
          <select value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">All plants</option>
            {data.plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived_at ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-label">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All activity</option>
            <option>Completed</option>
            <option>Skipped</option>
          </select>
        </label>
        <label className="filter-label">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="filter-label">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {from && to && from > to ? (
        <p role="alert" className="form-error">
          Choose an end date on or after the start date.
        </p>
      ) : (
        <section className="panel">
          <HistoryList items={items} />
        </section>
      )}
    </>
  );
}
