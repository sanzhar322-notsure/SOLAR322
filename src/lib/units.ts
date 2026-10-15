export type TempUnit = 'C' | 'F';
export type WindUnit = 'kmh' | 'mph' | 'ms';

export function temp(c: number | null | undefined, u: TempUnit): string | null {
  if (c == null) return null;
  return (u === 'F' ? c * 9 / 5 + 32 : c).toFixed(0);
}

export function tempUnit(u: TempUnit): string {
  return u === 'F' ? '°F' : '°C';
}

export function wind(kmh: number | null | undefined, u: WindUnit): string | null {
  if (kmh == null) return null;
  const v = u === 'mph' ? kmh / 1.609344 : u === 'ms' ? kmh / 3.6 : kmh;
  return v.toFixed(u === 'ms' ? 1 : 0);
}

export function windUnit(u: WindUnit): string {
  return u === 'mph' ? 'mph' : u === 'ms' ? 'm/s' : 'km/h';
}

export function deg(v: number | null | undefined, digits = 1): string | null {
  return v == null ? null : `${v.toFixed(digits)}°`;
}

export function coord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}
