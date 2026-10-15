/** WMO weather interpretation codes (as used by Open-Meteo). */
const CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, light hail',
  99: 'Thunderstorm, heavy hail',
};

export function describeWeather(code: number | null | undefined): string {
  if (code == null) return 'Conditions unavailable';
  return CODES[code] ?? `Weather code ${code}`;
}

export type WeatherGlyph = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown';

export function weatherGlyph(code: number | null | undefined): WeatherGlyph {
  if (code == null) return 'unknown';
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}
