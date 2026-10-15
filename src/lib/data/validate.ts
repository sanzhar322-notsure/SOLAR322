/** Validation of untrusted external numbers before they reach the UI. */

export type Range = readonly [number, number];

export const RANGES = {
  latitude: [-90, 90],
  longitude: [-180, 180],
  temperature: [-95, 65],
  percent: [0, 100],
  wind: [0, 450],
  precipitation: [0, 600],
  weatherCode: [0, 99],
  uv: [0, 30],
  irradiance: [0, 1500],
  elevation: [-450, 9000],
  unixSeconds: [946684800, 4102444800], // 2000 … 2100
} as const satisfies Record<string, Range>;

/** Returns a finite number within range, else null. Never coerces strings. */
export function num(v: unknown, range: Range): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < range[0] || v > range[1]) return null;
  return v;
}

/** Validates an array of length n; invalid entries become null. Missing array → all null. */
export function numArray(v: unknown, n: number, range: Range): (number | null)[] {
  if (!Array.isArray(v)) return new Array(n).fill(null);
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = num(v[i], range);
  return out;
}

/** Validates a strictly increasing array of unix-second timestamps → ms. */
export function timeArray(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: number[] = [];
  for (const x of v) {
    const s = num(x, RANGES.unixSeconds);
    if (s == null) return null;
    if (out.length && s * 1000 <= out[out.length - 1]) return null;
    out.push(s * 1000);
  }
  return out;
}
