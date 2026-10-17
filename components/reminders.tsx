"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useGarden } from "./garden-provider";
import { addDays } from "@/lib/dates";
import { activityLabel } from "@/lib/types";
export function useReminders(leadDays = 2) {
  const { data, today, notify } = useGarden();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setEnabled(
          typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            localStorage.getItem(`sproutly-reminders:${data.profile.id}`) ===
              "on",
        ),
      0,
    );
    return () => clearTimeout(timer);
  }, [data.profile.id]);
  useEffect(() => {
    if (
      !enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    let cancelled = false;
    const check = () => {
      data.schedules
        .filter(
          (s) =>
            s.active &&
            !s.archived_at &&
            s.next_due_date <= addDays(today, leadDays),
        )
        .forEach((s) => {
          const plant = data.plants.find(
            (p) => p.id === s.plant_id && !p.archived_at,
          );
          if (!plant) return;
          const key = `sproutly-notice:${data.profile.id}:${s.id}:${s.next_due_date}:${today}:${s.next_due_date < today ? "overdue" : s.next_due_date === today ? "today" : "upcoming"}`;
          const send = () => {
            if (cancelled) return;
            try {
              if (localStorage.getItem(key)) return;
              localStorage.setItem(key, "sent");
              try {
                new Notification(
                  s.next_due_date < today
                    ? "⏰ Overdue plant care"
                    : s.next_due_date === today
                      ? "🌱 Plant care today"
                      : "🗓️ Upcoming plant care",
                  {
                    body: `${plant.name}: ${activityLabel(s).toLowerCase()} ${s.next_due_date < today ? "was due " + s.next_due_date : s.next_due_date === today ? "is due today" : "is due " + s.next_due_date}.`,
                    tag: key,
                  },
                );
              } catch {
                localStorage.removeItem(key);
                notify(
                  "This browser could not display a notification. Your dashboard reminders still work.",
                  true,
                );
              }
            } catch {
              notify(
                "Browser storage is unavailable. Dashboard reminders still work.",
                true,
              );
            }
          };
          // Web Locks makes the check-and-mark atomic across multiple open tabs.
          if (navigator.locks)
            void navigator.locks
              .request(key, send)
              .catch(() =>
                notify(
                  "Unable to coordinate browser reminders. Dashboard reminders still work.",
                  true,
                ),
              );
          else send();
        });
    };
    check();
    const timer = setInterval(check, 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [data, enabled, today, notify, leadDays]);
  const toggle = async () => {
    try {
      if (enabled) {
        setEnabled(false);
        localStorage.setItem(`sproutly-reminders:${data.profile.id}`, "off");
        return;
      }
      if (typeof Notification === "undefined" || !window.isSecureContext) {
        notify(
          "Browser notifications require a supported browser on HTTPS or localhost.",
          true,
        );
        return;
      }
      const p = await Notification.requestPermission();
      if (p === "granted") {
        localStorage.setItem(`sproutly-reminders:${data.profile.id}`, "on");
        setEnabled(true);
        notify("Reminders enabled while this tab is open.");
      } else
        notify(
          "Notifications are blocked. Enable them in browser settings; dashboard reminders still work.",
          true,
        );
    } catch {
      notify(
        "This browser could not enable reminders. Dashboard reminders still work.",
        true,
      );
    }
  };
  return { enabled, toggle };
}
export function ReminderButton({
  enabled,
  toggle,
}: {
  enabled: boolean;
  toggle: () => Promise<void>;
}) {
  return (
    <button
      className="button secondary reminder-button"
      onClick={toggle}
      aria-pressed={enabled}
    >
      {enabled ? <BellOff size={16} /> : <Bell size={16} />}
      <span>{enabled ? "Reminders on" : "Enable reminders"}</span>
    </button>
  );
}
