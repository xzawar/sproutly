"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useGarden } from "./garden-provider";
import { useReminders, ReminderButton } from "./reminders";
import { Badge, Modal, ActivityIcon, Empty } from "./ui";
import { addDays, taskStatus, formatDate } from "@/lib/dates";
import { activityLabel } from "@/lib/types";
export function NotificationCenter() {
  const { data, demo, today } = useGarden();
  const [open, setOpen] = useState(false),
    [lead, setLead] = useState(2),
    [seen, setSeen] = useState("");
  const reminder = useReminders(lead);
  const key = `sproutly-inbox:${data.profile.id}`;
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSeen(localStorage.getItem(key) ?? "");
        setLead(Number(localStorage.getItem(key + ":lead") ?? 2));
      } catch {
        /* Preferences are optional when browser storage is unavailable. */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [key]);
  const items = data.schedules
    .filter(
      (s) =>
        s.active && !s.archived_at && s.next_due_date <= addDays(today, lead),
    )
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const signature = items
    .map(
      (s) =>
        s.id + ":" + s.next_due_date + ":" + taskStatus(s.next_due_date, today),
    )
    .join("|");
  const unread = seen !== signature ? items.length : 0;
  return (
    <>
      <button
        className="button secondary inbox-toggle"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen(true)}
      >
        <Bell size={18} />
        <span>Notifications</span>
        {unread > 0 && <b className="notification-count">{unread}</b>}
      </button>
      {open && (
        <Modal title="Your garden inbox 🌱" onClose={() => setOpen(false)}>
          <div className="notification-settings">
            <ReminderButton {...reminder} />
            <label className="field">
              Upcoming reminders
              <select
                value={lead}
                onChange={(e) => {
                  setLead(Number(e.target.value));
                  localStorage.setItem(key + ":lead", e.target.value);
                }}
              >
                {[0, 1, 2, 3, 7].map((n) => (
                  <option value={n} key={n}>
                    {n === 0 ? "On the due date only" : `${n} days ahead`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inbox-heading">
            <span className="muted">
              {unread} unread · While the app is open
            </span>
            <button
              className="text-link"
              onClick={() => {
                setSeen(signature);
                localStorage.setItem(key, signature);
              }}
            >
              Mark all read
            </button>
          </div>
          {!items.length ? (
            <Empty title="All quiet in the garden">
              <p>We’ll show care reminders here when they’re close.</p>
            </Empty>
          ) : (
            <div className="inbox-list">
              {items.map((s) => (
                <Link
                  href={`${demo ? "/demo" : ""}/plants/${s.plant_id}`}
                  key={s.id}
                  className="inbox-item"
                  onClick={() => setOpen(false)}
                >
                  <ActivityIcon activity={s.activity} />
                  <div>
                    <strong>
                      {data.plants.find((p) => p.id === s.plant_id)?.name}
                    </strong>
                    <p>
                      {activityLabel(s)} · {formatDate(s.next_due_date)}
                    </p>
                  </div>
                  <Badge status={taskStatus(s.next_due_date, today)} />
                </Link>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
