/**
 * UV index interpretation following WHO "Global Solar UV Index: A Practical
 * Guide" (2002). The UV index is an ENVIRONMENTAL quantity: erythemally
 * weighted irradiance on a horizontal surface, 1 UVI = 25 mW/m².
 */
import { interpolate } from './data/series';

export type UvCategory = 'low' | 'moderate' | 'high' | 'very-high' | 'extreme';

export interface UvBand {
  category: UvCategory;
  label: string;
  range: string;
  color: string;
  /** Short, neutral description of the intensity (shown on cards). */
  protection: string;
  /** WHO's own guidance for the category, attributed (shown in the protection panel). */
  detail: string;
}

export const UV_BANDS: UvBand[] = [
  {
    category: 'low', label: 'Low', range: '0–2', color: '#4f9d69',
    protection: 'Low erythemal intensity',
    detail: 'WHO: protection generally not required for most people. Snow, water and sand reflect UV; very sensitive skin and long exposure are exceptions.',
  },
  {
    category: 'moderate', label: 'Moderate', range: '3–5', color: '#d9b43a',
    protection: 'Moderate intensity — duration starts to matter',
    detail: 'WHO: seek shade around midday; cover up, wear a hat and sunglasses, and use sunscreen on exposed skin.',
  },
  {
    category: 'high', label: 'High', range: '6–7', color: '#e07b2e',
    protection: 'High intensity — exposure builds fairly quickly',
    detail: 'WHO: as for moderate — shade around midday, covering clothing, hat, sunglasses and sunscreen.',
  },
  {
    category: 'very-high', label: 'Very high', range: '8–10', color: '#c8463a',
    protection: 'Very high intensity — exposure builds quickly',
    detail: 'WHO: extra protection — avoid being outside during midday hours where possible; shade, shirt, hat, sunglasses and sunscreen.',
  },
  {
    category: 'extreme', label: 'Extreme', range: '11+', color: '#8a4fb0',
    protection: 'Extreme intensity — the top of the scale',
    detail: 'WHO: extra protection as for very high; unprotected skin can redden within minutes.',
  },
];

export function uvBand(uvi: number): UvBand {
  const r = Math.round(uvi);
  if (r <= 2) return UV_BANDS[0];
  if (r <= 5) return UV_BANDS[1];
  if (r <= 7) return UV_BANDS[2];
  if (r <= 10) return UV_BANDS[3];
  return UV_BANDS[4];
}

/** Erythemally weighted irradiance (W/m²) for a UV index. */
export function erythemalIrradiance(uvi: number): number {
  return uvi * 0.025;
}

/** 1 Standard Erythema Dose = 100 J/m² erythemally weighted (CIE S 007). */
export const SED_J_PER_M2 = 100;

export interface AmbientDose {
  /** Ambient erythemal radiant exposure on a horizontal plane, in SED. */
  sed: number | null;
  /** Fraction of the session covered by UV data (0–1). */
  coverage: number;
  peakUvi: number | null;
  meanUvi: number | null;
}

/**
 * Integrates the hourly UV index over a session to estimate the AMBIENT
 * horizontal erythemal exposure. This is not a personal dose: posture, shade,
 * clothing, sunscreen, reflection and orientation typically make personal
 * exposure substantially different (usually lower) than ambient.
 */
export function ambientDose(times: number[], uv: (number | null)[], start: number, end: number): AmbientDose {
  if (!(end > start)) return { sed: null, coverage: 0, peakUvi: null, meanUvi: null };
  const step = 60000;
  let joules = 0, covered = 0, peak: number | null = null, sum = 0, n = 0;
  for (let t = start; t < end; t += step) {
    const dt = Math.min(step, end - t);
    const v = interpolate(times, uv, t + dt / 2);
    if (v == null) continue;
    joules += erythemalIrradiance(v) * (dt / 1000);
    covered += dt;
    sum += v; n++;
    peak = peak == null ? v : Math.max(peak, v);
  }
  const coverage = covered / (end - start);
  return {
    sed: coverage > 0.9 ? joules / SED_J_PER_M2 : null,
    coverage,
    peakUvi: peak,
    meanUvi: n ? sum / n : null,
  };
}

export const UV_FACTORS = [
  { factor: 'Time of day', effect: 'UV peaks around solar noon, when the Sun is highest and its rays cross the least atmosphere.' },
  { factor: 'Season & latitude', effect: 'Higher Sun angles (summer, lower latitudes) mean more UV-B reaches the ground.' },
  { factor: 'Elevation', effect: 'UV increases with altitude — WHO cites roughly 10% per 1000 m — because there is less atmosphere above you.' },
  { factor: 'Ozone', effect: 'Stratospheric ozone absorbs UV-B; lower ozone columns raise the UV index.' },
  { factor: 'Clouds', effect: 'Thick cloud reduces UV, but thin or broken cloud may transmit much of it and can briefly enhance it.' },
  { factor: 'Reflection', effect: 'Fresh snow can reflect up to ~80% of UV; sand, water and concrete reflect less but still add exposure.' },
];
