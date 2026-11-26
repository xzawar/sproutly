"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Upload, WandSparkles } from "lucide-react";
import { useGarden } from "./garden-provider";
import { PageHeading } from "./ui";
import { plantSchema, plantCreateSchema } from "@/lib/validation";
import { uploadPlantImage, removeUnusedImage } from "@/app/actions";
import { rooms, roomIds } from "@/lib/home";
import type { Plant } from "@/lib/types";
import type { PlantProfile } from "@/lib/plant-guide";
const read = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export function PlantForm({
  plant,
  fromHome = false,
}: {
  plant?: Plant;
  fromHome?: boolean;
}) {
  const { data, demo, today, run, busy, notify } = useGarden();
  const router = useRouter();
  const base = demo ? "/demo" : "";
  const returnPath = plant
    ? `${base}/plants/${plant.id}`
    : fromHome
      ? `${base}/home`
      : `${base}/plants`;
  const [imageMode, setImageMode] = useState(
    plant?.image_path ? "upload" : "url",
  );
  const [waterRoutine, setWaterRoutine] = useState(false);
  const [feedRoutine, setFeedRoutine] = useState(false);
  const [waterEvery, setWaterEvery] = useState(7);
  const [feedEvery, setFeedEvery] = useState(30);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<"" | "ai" | "guide">("");
  const form = useRef<HTMLFormElement>(null);

  /** AI automation: turn a typed plant name into a care profile and routines. */
  async function autofill() {
    const f = form.current;
    if (!f || filling) return;
    const field = (name: string) =>
      f.elements.namedItem(name) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    const name = field("name")?.value.trim() ?? "";
    if (name.length < 2) {
      setError("Type the plant’s name first, e.g. “Monstera” or “Tulsi”.");
      field("name")?.focus();
      return;
    }
    setError("");
    setFilling(true);
    try {
      const r = await fetch("/api/ai/plant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categories: data.categories.map((c) => c.name),
        }),
      });
      const body = (await r.json()) as {
        profile?: PlantProfile;
        source?: "ai" | "guide";
        error?: string;
      };
      if (!r.ok || !body.profile)
        throw Error(body.error ?? "Couldn’t fill the form. Try again.");
      const p = body.profile;
      // A new plant takes the whole profile; an existing one only fills blanks.
      const put = (key: string, value: string) => {
        const el = field(key);
        if (el && value && (!plant || !el.value.trim())) el.value = value;
      };
      put("common_name", p.common_name);
      put("scientific_name", p.scientific_name);
      put("watering", p.watering);
      put("fertilizing", p.fertilizing);
      put("description", p.description);
      const category = data.categories.find(
        (c) => c.name.toLowerCase() === p.category.toLowerCase(),
      );
      if (category) put("category_id", category.id);
      if (!plant) {
        const sun = field("sunlight"),
          env = field("environment");
        if (sun) sun.value = p.sunlight;
        if (env) env.value = p.environment;
        setWaterEvery(p.water_every_days);
        setWaterRoutine(true);
        if (p.fertilize_every_days) {
          setFeedEvery(p.fertilize_every_days);
          setFeedRoutine(true);
        }
      }
      setFilled(body.source ?? "ai");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t fill the form.");
    } finally {
      setFilling(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading || busy) return;
    setError("");
    const f = new FormData(e.currentTarget);
    let uploaded: string | null = null;
    let imagePath = imageMode === "upload" ? (plant?.image_path ?? null) : null;
    let imageUrl = imageMode === "url" ? read(f, "image_url") || null : null;
    const file = f.get("image") as File | null;
    if (imageMode === "upload" && file?.size) {
      if (demo) {
        setError(
          "File uploads need Supabase Storage. In this local demo, use an HTTPS image URL instead.",
        );
        return;
      }
      setUploading(true);
      const result = await uploadPlantImage(f);
      setUploading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      imagePath = result.path;
      uploaded = result.path;
      imageUrl = null;
    }
    const v = {
      ...(plant ? { id: plant.id } : {}),
      name: read(f, "name"),
      common_name: read(f, "common_name"),
      scientific_name: read(f, "scientific_name"),
      category_id: read(f, "category_id") || null,
      location: read(f, "location"),
      sunlight: read(f, "sunlight"),
      environment: read(f, "environment"),
      watering: read(f, "watering"),
      fertilizing: read(f, "fertilizing"),
      description: read(f, "description"),
      notes: read(f, "notes"),
      added_on: read(f, "added_on"),
      image_url: imageUrl,
      image_path: imagePath,
    };
    const parsed = plantSchema.safeParse(v);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      if (uploaded) void removeUnusedImage(uploaded);
      return;
    }
    const create = plantCreateSchema.safeParse({
      plant: parsed.data,
      routines: (
        [
          ["Water", "water", waterRoutine],
          ["Fertilize", "feed", feedRoutine],
        ] as const
      )
        .filter(([, , enabled]) => enabled)
        .map(([activity, key]) => ({
          activity,
          interval_count: Number(f.get(`${key}_interval`)),
          first_due_date: read(f, `${key}_due`),
        })),
    });
    if (!plant && !create.success) {
      setError(create.error.issues[0].message);
      if (uploaded) void removeUnusedImage(uploaded);
      return;
    }
    let createdId = "";
    const ok = await run(
      plant
        ? { kind: "plant.save", payload: parsed.data }
        : { kind: "plant.create", payload: create.data! },
      (id) => {
        createdId = id;
      },
    );
    if (ok) {
      if (!demo && plant?.image_path && plant.image_path !== imagePath)
        void removeUnusedImage(plant.image_path);
      router.push(
        fromHome && createdId
          ? `${base}/home?plant=${encodeURIComponent(createdId)}`
          : returnPath,
      );
    } else if (uploaded) {
      await removeUnusedImage(uploaded);
      notify("The unsaved upload was removed. You can try again.", true);
    }
  }
  return (
    <>
      <Link className="back-link" href={returnPath}>
        <ArrowLeft size={16} /> Back to{" "}
        {plant ? "plant" : fromHome ? "Home" : "plants"}
      </Link>
      <PageHeading title={plant ? "Edit plant" : "Add plant"} />
      <form className="editor-form" onSubmit={submit} ref={form}>
        <section className="panel form-section">
          <h2>The essentials</h2>
          <div className="field ai-name">
            <label htmlFor="plant-name">
              Plant name <span aria-hidden="true">*</span>
            </label>
            <div className="ai-name-row">
              <input
                id="plant-name"
                name="name"
                required
                maxLength={100}
                defaultValue={plant?.name}
                placeholder="e.g. Monstera, Tulsi, Rose"
                aria-describedby="ai-fill-hint"
              />
              <button
                type="button"
                className="button ai-button"
                onClick={() => void autofill()}
                disabled={filling}
              >
                {filling ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <WandSparkles size={17} />
                )}
                {filling ? "Filling…" : "Fill with AI"}
              </button>
            </div>
            <span id="ai-fill-hint" className="hint" role="status">
              {filled === "ai"
                ? "Filled in by AI from the name. Review the details before saving."
                : filled === "guide"
                  ? "Filled in from the built-in plant guide. Review before saving."
                  : plant
                    ? "AI can fill in any empty care details from the name."
                    : "Type a name and let AI fill in the care profile and routines."}
            </span>
          </div>
          <div className="form-grid">
            <label className="field">
              Common name
              <input
                name="common_name"
                maxLength={100}
                defaultValue={plant?.common_name}
                placeholder="e.g. Swiss cheese plant"
              />
            </label>
            <label className="field">
              Scientific name
              <input
                name="scientific_name"
                maxLength={150}
                defaultValue={plant?.scientific_name}
                placeholder="e.g. Monstera deliciosa"
              />
            </label>
            <label className="field">
              Category
              <select
                name="category_id"
                defaultValue={plant?.category_id ?? ""}
              >
                <option value="">Uncategorized</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <label htmlFor="plant-location">Location</label>
              <input
                id="plant-location"
                name="location"
                list="home-location-options"
                aria-describedby="plant-location-hint"
                maxLength={100}
                defaultValue={plant?.location}
                placeholder="e.g. Kitchen countertop"
              />
              <datalist id="home-location-options">
                {roomIds.map((r) => (
                  <option key={r} value={rooms[r].name} />
                ))}
              </datalist>
              <span id="plant-location-hint" className="hint">
                This sets the plant’s place in your 3D home.
              </span>
            </div>
            <label className="field">
              Date added
              <input
                name="added_on"
                type="date"
                required
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={plant?.added_on ?? today}
              />
            </label>
          </div>
        </section>
        <section className="panel form-section">
          <h2>Care & character</h2>
          {!plant && (
            <div className="initial-routines">
              {[
                {
                  key: "water",
                  title: "💧 Watering routine",
                  detail: `Every ${waterEvery} days`,
                  enabled: waterRoutine,
                  set: setWaterRoutine,
                  interval: waterEvery,
                },
                {
                  key: "feed",
                  title: "🌻 Fertilizing routine",
                  detail: `Every ${feedEvery} days`,
                  enabled: feedRoutine,
                  set: setFeedRoutine,
                  interval: feedEvery,
                },
              ].map((r) => (
                <div
                  className={`routine-option ${r.enabled ? "on" : ""}`}
                  key={r.key}
                  role="group"
                  aria-label={r.title.slice(2)}
                >
                  <label className="routine-toggle">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => r.set(e.target.checked)}
                      aria-controls={`${r.key}-fields`}
                    />
                    <span>{r.title}</span>
                    {!r.enabled && <small>{r.detail}</small>}
                  </label>
                  {r.enabled && (
                    <div className="form-grid" id={`${r.key}-fields`}>
                      <label className="field">
                        {r.key === "water" ? "Water" : "Fertilize"} every (days)
                        <input
                          key={`${r.key}-${r.interval}`}
                          type="number"
                          name={`${r.key}_interval`}
                          min={1}
                          max={3650}
                          step={1}
                          defaultValue={r.interval}
                          required
                        />
                      </label>
                      <label className="field">
                        {r.key === "water" ? "Watering" : "Fertilizing"} first
                        due
                        <input
                          type="date"
                          name={`${r.key}_due`}
                          defaultValue={today}
                          min="1900-01-01"
                          max="9999-12-31"
                          required
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
              <p className="hint">Optional. Add or change routines later.</p>
            </div>
          )}
          <label className="field">
            Plant environment
            <select
              name="environment"
              defaultValue={plant?.environment ?? "indoor"}
            >
              <option value="indoor">🏡 Indoor / sheltered from rain</option>
              <option value="outdoor">🌳 Outdoor / exposed to rain</option>
            </select>
            <span className="hint">
              Rain suggestions apply only to outdoor plants.
            </span>
          </label>
          <div className="form-grid">
            <label className="field">
              Sunlight
              <select
                name="sunlight"
                defaultValue={plant?.sunlight ?? "Indirect"}
              >
                {["Full", "Partial", "Indirect", "Low light"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div />
            <label className="field">
              Watering notes (optional)
              <textarea
                name="watering"
                maxLength={2000}
                defaultValue={plant?.watering}
                rows={3}
                placeholder="Your plant’s watering needs…"
              />
            </label>
            <label className="field">
              Fertilizing notes (optional)
              <textarea
                name="fertilizing"
                maxLength={2000}
                defaultValue={plant?.fertilizing}
                rows={3}
                placeholder="When and how to feed…"
              />
            </label>
            <label className="field full">
              Description
              <textarea
                name="description"
                maxLength={4000}
                defaultValue={plant?.description}
                rows={2}
              />
            </label>
            <label className="field full">
              Personal notes
              <textarea
                name="notes"
                maxLength={4000}
                defaultValue={plant?.notes}
                rows={3}
              />
            </label>
          </div>
        </section>
        <section className="panel form-section">
          <h2>Photo</h2>
          <div className="segmented image-options">
            <button
              type="button"
              aria-pressed={imageMode === "url"}
              className={imageMode === "url" ? "selected" : ""}
              onClick={() => setImageMode("url")}
            >
              Image URL
            </button>
            <button
              type="button"
              aria-pressed={imageMode === "upload"}
              className={imageMode === "upload" ? "selected" : ""}
              onClick={() => setImageMode("upload")}
            >
              <Upload size={15} /> Upload image
            </button>
          </div>
          {imageMode === "url" ? (
            <label className="field">
              HTTPS image URL
              <input
                name="image_url"
                type="url"
                maxLength={2048}
                defaultValue={plant?.image_url ?? ""}
                placeholder="https://…"
              />
              <span className="hint">
                External URLs are not private. Leave blank to remove the current
                image.
              </span>
            </label>
          ) : (
            <label className="field">
              Choose image
              <input
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <span className="hint">
                JPEG, PNG or WebP · up to 5 MiB · private to your account.
                {plant?.image_path
                  ? " Keep the field empty to retain your current upload."
                  : ""}
                {demo ? " Uploads are unavailable in the local demo." : ""}
              </span>
            </label>
          )}
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="button secondary" href={returnPath}>
            Cancel
          </Link>
          <button className="button primary" disabled={busy || uploading}>
            {uploading
              ? "Uploading…"
              : busy
                ? "Saving…"
                : plant
                  ? "Save changes"
                  : "Add plant"}
          </button>
        </div>
      </form>
    </>
  );
}
