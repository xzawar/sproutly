"use client";
/* eslint-disable react-hooks/set-state-in-effect -- restore an explicit per-user weather cache */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useGarden } from "./garden-provider";
import { PageHeading, Empty } from "./ui";
import { rainExpected, weatherLabel, type Forecast } from "@/lib/weather";
import { TaskList } from "./tasks";
const Context = createContext<{
  weather: Forecast | null;
  loading: boolean;
  error: string;
  locate: () => void;
  clear: () => void;
  load: (lat: number, lon: number) => Promise<void>;
}>({
  weather: null,
  loading: false,
  error: "",
  locate: () => {},
  clear: () => {},
  load: async () => {},
});
export const useWeather = () => useContext(Context);
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { data } = useGarden();
  const key = `sproutly-weather:${data.profile.id}`;
  const [weather, setWeather] = useState<Forecast | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (lat: number, lon: number) => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `/api/weather?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`,
        );
        const w = await r.json();
        if (!r.ok) throw Error(w.error);
        setWeather(w);
        sessionStorage.setItem(key, JSON.stringify(w));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load weather");
      } finally {
        setLoading(false);
      }
    },
    [key],
  );
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(key);
      if (s) {
        const w = JSON.parse(s) as Forecast;
        setWeather(w);
        if (Date.now() - w.fetchedAt > 600000)
          void load(w.latitude, w.longitude);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }, [key, load]);
  useEffect(() => {
    if (!weather) return;
    const refresh = () => {
      if (navigator.onLine && Date.now() - weather.fetchedAt > 600000)
        void load(weather.latitude, weather.longitude);
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [weather, load]);
  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location isn’t supported. Choose coordinates below.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => void load(p.coords.latitude, p.coords.longitude),
      () => {
        setLoading(false);
        setError(
          "Location permission was declined or unavailable. You can enter coordinates below.",
        );
      },
      { timeout: 12000, maximumAge: 300000 },
    );
  };
  return (
    <Context.Provider
      value={{
        weather,
        loading,
        error,
        locate,
        load,
        clear: () => {
          sessionStorage.removeItem(key);
          setWeather(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function WeatherView() {
  const { data, today } = useGarden();
  const { weather: w, loading, error, locate, clear, load } = useWeather();
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
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE LOCAL KNOW-HOW"
        title="Weather & your garden"
        description="A forecast, not a soil sensor. Check your plants before changing care."
        action={
          <button
            className="button primary"
            disabled={loading}
            onClick={locate}
          >
            {loading ? "Finding your forecast…" : "📍 Use current location"}
          </button>
        }
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!w ? (
        <section className="panel weather-intro">
          <Empty title="Let’s see what’s overhead.">
            <p>
              Allow location access to see your local forecast. We round
              coordinates before sending them to Open-Meteo; location stays in
              this tab’s cache.
            </p>
          </Empty>
        </section>
      ) : (
        <>
          <section className="weather-hero">
            <div>
              <span className="eyebrow">
                {w.latitude.toFixed(2)}°, {w.longitude.toFixed(2)}° ·{" "}
                {w.timezone}
              </span>
              <h2>
                {weatherLabel(w.current.weather_code) === "Clear skies"
                  ? "☀️"
                  : "🌦️"}{" "}
                {Math.round(w.current.temperature_2m)}°<span>C</span>
              </h2>
              <p>
                {weatherLabel(w.current.weather_code)} · Observed{" "}
                {w.current.time.replace("T", " ")}
              </p>
            </div>
            <div className="weather-stats">
              <p>
                <strong>{w.current.relative_humidity_2m}%</strong> Humidity
              </p>
              <p>
                <strong>{w.current.rain} mm</strong> Current rain
              </p>
              <p>
                <strong>
                  {w.daily.precipitation_probability_max[0] ?? "—"}%
                </strong>{" "}
                Rain chance today
              </p>
            </div>
          </section>
          <div className="forecast-grid">
            {w.daily.time.map((day, i) => (
              <article className="panel forecast-card" key={day}>
                <strong>
                  {new Date(day + "T12:00:00Z").toLocaleDateString("en", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </strong>
                <span>{weatherLabel(w.daily.weather_code[i])}</span>
                <b>
                  {Math.round(w.daily.temperature_2m_max[i])}° /{" "}
                  {Math.round(w.daily.temperature_2m_min[i])}°
                </b>
                <span>
                  💧 {w.daily.precipitation_probability_max[i]}% ·{" "}
                  {(w.daily.rain_sum[i] + w.daily.showers_sum[i]).toFixed(1)} mm
                </span>
              </article>
            ))}
          </div>
          <section className="panel weather-tasks">
            <h2>
              {rain ? "🌧️ Rain expected today" : "🌱 Your outdoor watering"}
            </h2>
            <p className="muted">
              {rain
                ? "Forecast: at least 60% rain probability and 1 mm of rain/showers. Only outdoor watering is flagged. Confirm soil moisture and exposure; a forecast never automatically completes care."
                : "No rain-based skip suggestion right now. Follow your schedule and check soil moisture."}
            </p>
            {outdoor.length ? (
              <TaskList schedules={outdoor} />
            ) : (
              <Empty title="No outdoor watering due">
                <p>
                  Your indoor plants and future watering routines stay
                  unchanged.
                </p>
              </Empty>
            )}
          </section>
          <p className="hint">
            Forecast by{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{" "}
            · Retrieved {new Date(w.fetchedAt).toLocaleTimeString()} ·{" "}
            <button className="text-link" onClick={clear}>
              Forget location
            </button>
          </p>
        </>
      )}
      <details className="panel location-fallback">
        <summary>Choose location manually</summary>
        <p className="hint">
          If location access is unavailable, enter latitude and longitude.
        </p>
        <form
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void load(Number(f.get("lat")), Number(f.get("lon")));
          }}
        >
          <label className="field">
            Latitude
            <input
              name="lat"
              type="number"
              min={-90}
              max={90}
              step="any"
              required
            />
          </label>
          <label className="field">
            Longitude
            <input
              name="lon"
              type="number"
              min={-180}
              max={180}
              step="any"
              required
            />
          </label>
          <button className="button secondary" disabled={loading}>
            Show weather
          </button>
        </form>
      </details>
    </>
  );
}
