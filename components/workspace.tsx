"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  History,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  Menu,
  Settings2,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { GardenProvider, useGarden } from "./garden-provider";
import {
  Dashboard,
  HistoryView,
  PlantDetail,
  PlantsView,
  TasksView,
} from "./views";
import { CalendarView } from "./calendar";
import { PlantForm } from "./plant-form";
import { ScheduleForm } from "./schedule-form";
import { AdminCategories, AdminUsers, ProfileView } from "./settings";
import { WeatherProvider, WeatherView } from "./weather";
import { GrowthView } from "./growth";
import { NotificationCenter } from "./notification-center";
import { Empty } from "./ui";

import type { WorkspaceData } from "@/lib/types";
function WorkspaceInner() {
  const { data, demo, busy } = useGarden();
  const path = usePathname();
  const params = useSearchParams();
  const base = demo ? "/demo" : "";
  const current = path.replace(/^\/demo(?=\/|$)/, "") || "/dashboard";
  const [menu, setMenu] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const links = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a,button:not(:disabled)",
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    links()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
      if (event.key === "Tab") {
        const elements = links(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [menu]);
  const nav = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/plants", label: "My plants", icon: Sprout },
    { href: "/tasks", label: "Care tasks", icon: ListChecks },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/history", label: "Care history", icon: History },
    { href: "/growth", label: "Growth journal", icon: Sprout },
    { href: "/weather", label: "Weather", icon: Leaf },
  ];
  const route = () => {
    if (current === "/" || current === "/dashboard") return <Dashboard />;
    if (current === "/plants") return <PlantsView />;
    if (current === "/plants/new") return <PlantForm />;
    if (current === "/tasks")
      return (
        <TasksView
          key={params.get("status")}
          initialStatus={params.get("status") ?? "All"}
        />
      );
    if (current === "/calendar") return <CalendarView />;
    if (current === "/history") return <HistoryView />;
    if (current === "/weather") return <WeatherView />;
    if (current === "/growth") return <GrowthView />;
    if (current === "/profile") return <ProfileView />;
    if (current === "/admin/users") return <AdminUsers />;
    if (current === "/admin/categories") return <AdminCategories />;
    const s = current.match(/^\/schedules\/([^/]+)\/edit$/);
    if (s) {
      const schedule = data.schedules.find(
        (x) => x.id === s[1] && !x.archived_at,
      );
      if (schedule)
        return <ScheduleForm key={schedule.id} schedule={schedule} />;
    }
    const p = current.match(/^\/plants\/([^/]+)(\/edit|\/schedules\/new)?$/);
    if (p) {
      const plant = data.plants.find((x) => x.id === p[1]);
      if (plant) {
        if (!p[2]) return <PlantDetail plant={plant} />;
        if (!plant.archived_at && p[2] === "/edit")
          return <PlantForm key={plant.id} plant={plant} />;
        if (!plant.archived_at)
          return (
            <ScheduleForm
              plantId={plant.id}
              initialActivity={params.get("activity") ?? "Water"}
            />
          );
      }
    }
    return (
      <Empty title="This page isn’t in your garden">
        <p>It may have moved, or you may not have access.</p>
        <Link className="button primary" href={`${base}/dashboard`}>
          Back to overview
        </Link>
      </Empty>
    );
  };
  const navLink = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: typeof Leaf;
  }) => (
    <Link
      key={href}
      href={`${base}${href}`}
      onClick={() => setMenu(false)}
      className={`nav-link ${current === href || (href === "/plants" && current.startsWith("/plants/")) ? "active" : ""}`}
      aria-current={current === href ? "page" : undefined}
    >
      <Icon size={19} />
      <span>{label}</span>
      {current === href && <span className="active-dot" />}
    </Link>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={sidebar}
        className={`sidebar ${menu ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <Link
          href={`${base}/dashboard`}
          className="brand"
          onClick={() => setMenu(false)}
        >
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          <span>
            sproutly<span className="brand-period">.</span>
            <small>PLANT CARE, SIMPLIFIED</small>
          </span>
        </Link>
        <button
          className="icon-button close-sidebar"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <p className="nav-eyebrow">YOUR GARDEN</p>
        <nav>{nav.map(navLink)}</nav>
        {data.profile.role === "admin" && (
          <>
            <p className="nav-eyebrow admin-eyebrow">ADMINISTRATION</p>
            <nav>
              {navLink({ href: "/admin/users", label: "Users", icon: Users })}
              {navLink({
                href: "/admin/categories",
                label: "Categories",
                icon: Settings2,
              })}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <Link
            href={`${base}/profile`}
            onClick={() => setMenu(false)}
            className={`profile-link ${current === "/profile" ? "active" : ""}`}
          >
            <span className="avatar">
              {data.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{data.profile.name}</strong>
              <small>{demo ? "Local demo garden" : "Personal garden"}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
          {demo ? (
            <Link href="/login" className="logout-link">
              <LogOut size={16} /> Leave demo
            </Link>
          ) : (
            <button
              className="logout-link"
              disabled={busy}
              onClick={() => {
                for (const key of Object.keys(sessionStorage))
                  if (key.startsWith("sproutly-"))
                    sessionStorage.removeItem(key);
                const form = document.createElement("form");
                form.method = "POST";
                form.action = "/auth/logout";
                document.body.appendChild(form);
                form.submit();
              }}
            >
              <LogOut size={16} /> Log out
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="workspace-label">Sproutly</span>
          </div>
          <NotificationCenter />
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>Demo</strong> · Saved in this browser.
            </span>
            <Link href="/login">
              Connect your garden <ChevronRight size={14} />
            </Link>
          </div>
        )}
        <main id="main" className="main-content" aria-busy={busy}>
          {route()}
          <footer className="app-footer">
            <span>
              <Leaf size={14} /> Sproutly
            </span>
            <span>Plant care, organized.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export function Workspace({
  initialData,
  demo = false,
}: {
  initialData: WorkspaceData;
  demo?: boolean;
}) {
  return (
    <GardenProvider initialData={initialData} demo={demo}>
      <WeatherProvider>
        <WorkspaceInner />
      </WeatherProvider>
    </GardenProvider>
  );
}
