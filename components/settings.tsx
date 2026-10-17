"use client";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { categoryEmoji } from "@/lib/types";
import { useGarden } from "./garden-provider";
import { Empty, Modal, PageHeading } from "./ui";
import { profileSchema } from "@/lib/validation";
import { formatDate } from "@/lib/dates";
import type { Category } from "@/lib/types";
export function ProfileView() {
  const { data, demo, run, busy, reset } = useGarden();
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = profileSchema.safeParse({
      name: f.get("name"),
      timezone: f.get("timezone"),
    });
    if (!v.success) {
      setError(v.error.issues[0].message);
      return;
    }
    setError("");
    await run({ kind: "profile.save", payload: v.data });
  }
  return (
    <>
      <PageHeading title="Your profile" />
      <form onSubmit={submit} className="editor-form">
        <section className="panel form-section">
          <div className="profile-summary">
            <div className="avatar large">{data.profile.name.slice(0, 1)}</div>
            <div>
              <h2>{data.profile.name}</h2>
              <p className="muted">{data.profile.email}</p>
            </div>
            <span className="badge badge-upcoming">{data.profile.role}</span>
          </div>
          <div className="form-grid">
            <label className="field">
              Name
              <input
                name="name"
                maxLength={100}
                required
                defaultValue={data.profile.name}
              />
            </label>
            <label className="field">
              Email
              <input value={data.profile.email} aria-label="Email" readOnly />
              <span className="hint">
                Email is managed by Supabase Auth and is read-only here.
              </span>
            </label>
            <label className="field full">
              Timezone
              <input
                name="timezone"
                aria-label="Timezone"
                list="timezones"
                required
                defaultValue={data.profile.timezone}
              />
              <datalist id="timezones">
                {[
                  "UTC",
                  "Asia/Karachi",
                  "Asia/Kolkata",
                  "Asia/Dubai",
                  "Europe/London",
                  "Europe/Berlin",
                  "America/New_York",
                  "America/Chicago",
                  "America/Los_Angeles",
                  "Australia/Sydney",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
              <span className="hint">
                Use an IANA timezone, such as Asia/Karachi. Due dates and
                completion dates follow this setting.
              </span>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </div>
        </section>
      </form>
      {demo && (
        <section className="panel form-section demo-settings">
          <h2>Demo data</h2>
          <p className="muted">
            This is an isolated demo. Changes stay in this browser, not in
            Supabase. Admin sample users are fictional. Resetting clears all
            demo changes.
          </p>
          <button className="button secondary" onClick={() => setConfirm(true)}>
            Reset demo garden
          </button>
        </section>
      )}
      {confirm && (
        <Modal title="Reset local demo?" onClose={() => setConfirm(false)}>
          <p className="muted modal-copy">
            All changes you made in the demo will be replaced with the sample
            garden.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                reset();
                setConfirm(false);
              }}
            >
              Reset demo
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function AdminUsers() {
  const { data } = useGarden();
  const [query, setQuery] = useState("");
  if (data.profile.role !== "admin")
    return (
      <Empty title="Admin access required">
        <p>This area is only available to administrators.</p>
      </Empty>
    );
  const users = data.users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading title="Registered users" />
      <div className="admin-note">
        <ShieldCheck size={18} />
        <span>
          Admin access does not include other users’ plants or care history.
        </span>
      </div>
      <label className="search-field admin-search">
        <input
          aria-label="Search users"
          placeholder="Search name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <span className="table-secondary">{u.email}</span>
                </td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td>
                  {formatDate(u.created_at.slice(0, 10), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && (
          <Empty title="No users found">
            <p>Try a different search.</p>
          </Empty>
        )}
      </section>
    </>
  );
}
export function AdminCategories() {
  const { data, run, busy } = useGarden();
  const [editing, setEditing] = useState<Category | null | undefined>(
    undefined,
  );
  const [removing, setRemoving] = useState<Category | null>(null);
  const [name, setName] = useState("");
  if (data.profile.role !== "admin")
    return (
      <Empty title="Admin access required">
        <p>This area is only available to administrators.</p>
      </Empty>
    );
  return (
    <>
      <PageHeading
        title="Plant categories"

        action={
          <button
            className="button primary"
            onClick={() => {
              setName("");
              setEditing(null);
            }}
          >
            <Plus size={17} /> Add category
          </button>
        }
      />
      <section className="panel category-list">
        {[...data.categories]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <div className="category-row" key={c.id}>
              <span className="category-symbol" aria-hidden="true">
                {categoryEmoji(c.name)}
              </span>
              <strong>{c.name}</strong>
              <button
                className="icon-button"
                aria-label={`Edit ${c.name}`}
                onClick={() => {
                  setName(c.name);
                  setEditing(c);
                }}
              >
                <Pencil size={17} />
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete ${c.name}`}
                onClick={() => setRemoving(c)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
      </section>
      <p className="hint page-footnote">
        Categories in use cannot be deleted. Reassign plants first, including
        archived plants. Names must be unique, ignoring case.
      </p>
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit category" : "New category"}
          onClose={() => !busy && setEditing(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run({
                  kind: "category.save",
                  payload: { ...(editing ? { id: editing.id } : {}), name },
                })
              )
                setEditing(undefined);
            }}
          >
            <label className="field">
              Category name
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save category"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Delete category?"
          onClose={() => !busy && setRemoving(null)}
        >
          <p className="muted modal-copy">
            Delete “{removing.name}”? This is permanent and only works if no
            plants use this category.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({
                    kind: "category.delete",
                    payload: { id: removing.id },
                  })
                )
                  setRemoving(null);
              }}
            >
              Delete category
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
