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
export function rainExpected(w: Forecast | null, today: string) {
  if (!w || Date.now() - w.fetchedAt > 30 * 60000) return false;
  const i = w.daily.time.indexOf(today);
  return (
    i >= 0 &&
    w.daily.precipitation_probability_max[i] >= 60 &&
    w.daily.rain_sum[i] + w.daily.showers_sum[i] >= 1
  );
}
export const weatherLabel = (code: number) =>
  code === 0
    ? "Clear skies"
    : code < 4
      ? "Partly cloudy"
      : code < 50
        ? "Foggy"
        : code < 70
          ? "Rain"
          : code < 80
            ? "Snow"
            : code < 85
              ? "Rain showers"
              : code < 90
                ? "Snow showers"
                : "Thunderstorms";
