"use client";
/* eslint-disable react-hooks/set-state-in-effect -- restore a per-user place and forecast cache */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Search,
  Sun,
  Umbrella,
  X,
} from "lucide-react";
import { useGarden } from "./garden-provider";
import { PageHeading, Empty } from "./ui";
import {
  rainExpected,
  weatherKind,
  weatherLabel,
  type Forecast,
  type Place,
  type WeatherKind,
} from "@/lib/weather";
import { TaskList } from "./tasks";

interface WeatherContext {
  weather: Forecast | null;
  place: Place | null;
  loading: boolean;
  error: string;
  choose: (place: Place) => void;
  locate: () => void;
  clear: () => void;
}
const Context = createContext<WeatherContext>({
  weather: null,
  place: null,
  loading: false,
  error: "",
  choose: () => {},
  locate: () => {},
  clear: () => {},
});
export const useWeather = () => useContext(Context);

const STALE = 10 * 60000;
const read = <T,>(store: () => Storage, key: string): T | null => {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (store: () => Storage, key: string, value: unknown) => {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private windows */
  }
};
const local = () => localStorage;
const session = () => sessionStorage;

export function WeatherProvider({ children }: { children: ReactNode }) {
  const { data } = useGarden();
  const placeKey = `sproutly-place:${data.profile.id}`;
  const forecastKey = `sproutly-weather:${data.profile.id}`;
  const [weather, setWeather] = useState<Forecast | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  const load = useCallback(
    async (lat: number, lon: number) => {
      const ticket = ++request.current;
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `/api/weather?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`,
        );
        const w = await r.json();
        if (!r.ok) throw Error(w.error);
        if (ticket !== request.current) return;
        setWeather(w);
        write(session, forecastKey, w);
      } catch (e) {
        if (ticket === request.current)
          setError(e instanceof Error ? e.message : "Unable to load weather");
      } finally {
        if (ticket === request.current) setLoading(false);
      }
    },
    [forecastKey],
  );

  // Restore the saved place and any fresh forecast; refresh a stale one.
  useEffect(() => {
    const saved = read<Place>(local, placeKey);
    const cached = read<Forecast>(session, forecastKey);
    setPlace(saved);
    if (!saved) return;
    const matches =
      cached &&
      Math.abs(cached.latitude - saved.latitude) < 0.1 &&
      Math.abs(cached.longitude - saved.longitude) < 0.1;
    if (matches) setWeather(cached);
    if (!matches || !cached || Date.now() - cached.fetchedAt > STALE)
      void load(saved.latitude, saved.longitude);
  }, [placeKey, forecastKey, load]);

  useEffect(() => {
    if (!place) return;
    const refresh = () => {
      if (
        navigator.onLine &&
        (!weather || Date.now() - weather.fetchedAt > STALE)
      )
        void load(place.latitude, place.longitude);
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [place, weather, load]);

  const choose = useCallback(
    (next: Place) => {
      setPlace(next);
      write(local, placeKey, next);
      void load(next.latitude, next.longitude);
    },
    [placeKey, load],
  );

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location isn’t supported here. Search for your city instead.");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        choose({
          id: "current",
          name: "Current location",
          region: "",
          country: "",
          latitude: Math.round(p.coords.latitude * 100) / 100,
          longitude: Math.round(p.coords.longitude * 100) / 100,
          label: "Current location",
        }),
      () => {
        setLoading(false);
        setError(
          "Location permission was declined. Search for your city instead.",
        );
      },
      { timeout: 12000, maximumAge: 300000 },
    );
  };

  const clear = () => {
    request.current++;
    write(local, placeKey, null);
    write(session, forecastKey, null);
    setPlace(null);
    setWeather(null);
    setLoading(false);
    setError("");
  };

  return (
    <Context.Provider
      value={{ weather, place, loading, error, choose, locate, clear }}
    >
      {children}
    </Context.Provider>
  );
}

const icons: Record<WeatherKind, typeof Sun> = {
  clear: Sun,
  cloudy: CloudSun,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};
export function WeatherIcon({
  code,
  size = 22,
}: {
  code: number;
  size?: number;
}) {
  const kind = weatherKind(code);
  const Icon = code === 3 ? Cloud : icons[kind];
  return (
    <Icon size={size} className={`wx-icon wx-${kind}`} aria-hidden="true" />
  );
}

/** City search with suggestions (combobox pattern). */
export function PlaceSearch() {
  const { choose, locate, loading } = useWeather();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const listId = useId();

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      setMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        setResults(body.places);
        setActive(body.places.length ? 0 : -1);
        setMessage(body.places.length ? "" : `No places match “${text}”.`);
        setOpen(true);
      } catch (e) {
        if (!controller.signal.aborted) {
          setResults([]);
          setMessage(e instanceof Error ? e.message : "Search failed.");
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 280);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  const pick = (p: Place) => {
    choose(p);
    setQ("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="place-search">
      <div className="place-input">
        <Search size={18} aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open && (results.length > 0 || Boolean(message))}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 && results[active] ? `${listId}-${active}` : undefined
          }
          aria-label="Search for a city or town"
          placeholder="Search a city, e.g. Lahore"
          value={q}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {busy ? (
          <LoaderCircle size={18} className="spin" aria-label="Searching" />
        ) : q ? (
          <button
            className="icon-button ghost"
            aria-label="Clear search"
            onClick={() => setQ("")}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      <button
        className="button secondary locate-button"
        onClick={locate}
        disabled={loading}
        title="Use my current location"
      >
        <LocateFixed size={17} />
        <span>Use my location</span>
      </button>
      {open && (results.length > 0 || message) && (
        <ul className="place-results" id={listId} role="listbox">
          {results.map((p, i) => (
            <li
              key={`${p.id}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={16} aria-hidden="true" />
              <span>
                <strong>{p.name}</strong>
                <small>
                  {[p.region !== p.name ? p.region : "", p.country]
                    .filter(Boolean)
                    .join(", ")}
                </small>
              </span>
            </li>
          ))}
          {message && <li className="place-empty">{message}</li>}
        </ul>
      )}
    </div>
  );
}

const day = (iso: string, i: number) =>
  i === 0
    ? "Today"
    : new Date(iso + "T12:00:00Z").toLocaleDateString("en", {
        weekday: "short",
        timeZone: "UTC",
      });

export function WeatherView() {
  const { data, today } = useGarden();
  const { weather: w, place, loading, error, clear } = useWeather();
  const rain = rainExpected(w, today);
  const outdoor = data.schedules.filter(
    (s) =>
      s.active &&
      !s.archived_at &&
      s.activity === "Water" &&
      s.next_due_date <= today &&
      data.plants.some(
        (p) =>
          p.id === s.plant_id && p.environment === "outdoor" && !p.archived_at,
      ),
  );
  const todayIndex = w ? Math.max(0, w.daily.time.indexOf(today)) : 0;
  return (
    <>
      <PageHeading
        title="Weather"
        description="Your local forecast and what it means for outdoor plants."
      />
      <section className="panel weather-search">
        <PlaceSearch />
        {place && (
          <p className="place-current">
            <MapPin size={15} aria-hidden="true" />
            Showing <strong>{place.label}</strong>
            <button className="text-link" onClick={clear}>
              Change
            </button>
          </p>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!w ? (
        loading ? (
          <p className="loading-inline" role="status">
            <LoaderCircle size={18} className="spin" /> Loading forecast…
          </p>
        ) : (
          <section className="panel weather-intro">
            <Empty title="Where are your plants?">
              <p>
                Search for your city above. Only the place name and rounded
                coordinates are sent to the forecast provider.
              </p>
            </Empty>
          </section>
        )
      ) : (
        <>
          <section className="wx-now" aria-live="polite">
            <div className="wx-now-main">
              <WeatherIcon code={w.current.weather_code} size={52} />
              <div>
                <p className="wx-place">{place?.label ?? "Your location"}</p>
                <p className="wx-temp">
                  {Math.round(w.current.temperature_2m)}°<span>C</span>
                </p>
                <p className="wx-cond">
                  {weatherLabel(w.current.weather_code)} · H{" "}
                  {Math.round(w.daily.temperature_2m_max[todayIndex])}° · L{" "}
                  {Math.round(w.daily.temperature_2m_min[todayIndex])}°
                </p>
              </div>
            </div>
            <dl className="wx-stats">
              <div>
                <dt>
                  <Droplets size={15} /> Humidity
                </dt>
                <dd>{w.current.relative_humidity_2m}%</dd>
              </div>
              <div>
                <dt>
                  <Umbrella size={15} /> Rain chance
                </dt>
                <dd>
                  {w.daily.precipitation_probability_max[todayIndex] ?? "—"}%
                </dd>
              </div>
              <div>
                <dt>
                  <CloudRain size={15} /> Rain today
                </dt>
                <dd>
                  {(
                    w.daily.rain_sum[todayIndex] +
                    w.daily.showers_sum[todayIndex]
                  ).toFixed(1)}{" "}
                  mm
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel wx-week" aria-label="7-day forecast">
            {w.daily.time.map((d, i) => (
              <div className="wx-day" key={d}>
                <span className="wx-day-name">{day(d, i)}</span>
                <WeatherIcon code={w.daily.weather_code[i]} size={20} />
                <span className="wx-day-label">
                  {weatherLabel(w.daily.weather_code[i])}
                </span>
                <span className="wx-day-rain">
                  <Droplets size={13} aria-hidden="true" />
                  {w.daily.precipitation_probability_max[i]}%
                </span>
                <span className="wx-day-temp">
                  <b>{Math.round(w.daily.temperature_2m_max[i])}°</b>
                  <span>{Math.round(w.daily.temperature_2m_min[i])}°</span>
                </span>
              </div>
            ))}
          </section>
          <section className="panel weather-tasks">
            <h2>{rain ? "Rain expected today" : "Outdoor watering"}</h2>
            <p className="muted">
              {rain
                ? "At least 60% chance and 1 mm of rain. You can skip outdoor watering — check the soil first. Nothing changes until you confirm."
                : "No rain skip suggested today. Follow your schedule and check the soil."}
            </p>
            {outdoor.length ? (
              <TaskList schedules={outdoor} />
            ) : (
              <p className="weather-none">
                No outdoor watering is due. Indoor plants aren’t affected by
                rain.
              </p>
            )}
          </section>
          <p className="hint">
            Forecast by{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{" "}
            · Updated{" "}
            {new Date(w.fetchedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
            {loading && " · refreshing…"}
          </p>
        </>
      )}
    </>
  );
}
