export interface Forecast {
  fetchedAt: number;
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    rain: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    rain_sum: number[];
    showers_sum: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

/** A place chosen by name search, or the browser's current position. */
export interface Place {
  id: number | string;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  label: string;
}

export const placeLabel = (
  name: string,
  region?: string | null,
  country?: string | null,
) =>
  [name, region && region !== name ? region : "", country ?? ""]
    .filter(Boolean)
    .join(", ");

export function rainExpected(w: Forecast | null, today: string) {
  if (!w || Date.now() - w.fetchedAt > 30 * 60000) return false;
  const i = w.daily.time.indexOf(today);
  return (
    i >= 0 &&
    w.daily.precipitation_probability_max[i] >= 60 &&
    w.daily.rain_sum[i] + w.daily.showers_sum[i] >= 1
  );
}

/** WMO weather interpretation codes, grouped into a few plain-language kinds. */
export type WeatherKind =
  "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || code === 85 || code === 86) return "snow";
  return "storm";
}

export function weatherLabel(code: number) {
  if (code === 0) return "Clear skies";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
