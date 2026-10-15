/**
 * Solar spectrum reference data and honest estimates.
 *
 * Reference spectra: ASTM G173-03 (extraterrestrial AM0 and hemispherical
 * "global" AM1.5 on a 37°-tilted surface, computed with Gueymard's SMARTS
 * model), integrated in 20 nm bins from 280–2500 nm using the copy
 * distributed with pvlib-python. Band fractions below were integrated from the
 * full-resolution tables (280–4000 nm). These are STANDARD REFERENCE
 * conditions, not your sky.
 */

export interface SpectralBand {
  id: 'uvb' | 'uva' | 'visible' | 'ira' | 'irb' | 'irc';
  name: string;
  nm: [number, number];
  color: string;
  /** Share of AM1.5 global irradiance (280–4000 nm), % — ASTM G173-03. */
  groundPct: number;
  /** Share of extraterrestrial (AM0) irradiance (280–4000 nm), %. */
  spacePct: number;
  physics: string;
  biology: string;
  safety: string;
}

export const BANDS: SpectralBand[] = [
  {
    id: 'uvb', name: 'UV-B', nm: [280, 315], color: '#7b5cff', groundPct: 0.07, spacePct: 1.29,
    physics:
      'Strongly absorbed by stratospheric ozone, so very little reaches the ground — and the amount depends steeply on solar elevation, season and ozone. Shortest wavelengths reaching the surface.',
    biology:
      'Absorbed in the epidermis. Drives cutaneous vitamin D3 synthesis (previtamin D3 from 7-dehydrocholesterol) and is the main cause of sunburn (erythema). Directly damages DNA (cyclobutane pyrimidine dimers).',
    safety: 'Main contributor to the UV index and to sunburn. Classified with all solar UV as a Group 1 carcinogen by IARC.',
  },
  {
    id: 'uva', name: 'UV-A', nm: [315, 400], color: '#9b7bff', groundPct: 4.54, spacePct: 6.34,
    physics: 'Less affected by ozone; present from early morning to late afternoon and passes through most window glass.',
    biology:
      'Penetrates into the dermis. Causes immediate pigment darkening and contributes to photo-ageing and indirect (oxidative) DNA damage. Weighted less than UV-B in the erythema action spectrum.',
    safety: 'Contributes to skin ageing and skin-cancer risk; a "low UV index" does not mean zero UV-A.',
  },
  {
    id: 'visible', name: 'Visible', nm: [400, 780], color: '#e8c35a', groundPct: 52.04, spacePct: 47.05,
    physics:
      'The band our eyes evolved to see; the Sun\'s output peaks here. Short-wavelength ("blue") light is scattered most by the atmosphere, which is why the sky is blue and low-Sun light is warmer in colour.',
    biology:
      'Light entering the eye drives vision and — via melanopsin-containing intrinsically photosensitive retinal ganglion cells (ipRGCs, peak sensitivity ≈ 480 nm) — the circadian clock, pupil reflex, alertness and melatonin suppression.',
    safety: 'Never look directly at the Sun: solar retinopathy can occur in seconds to minutes, and it does not hurt while happening.',
  },
  {
    id: 'ira', name: 'Infrared-A (near-IR)', nm: [780, 1400], color: '#d0583f', groundPct: 32.42, spacePct: 30.48,
    physics:
      'Near-infrared penetrates several millimetres into tissue. Water vapour and cloud liquid water create deep absorption bands (e.g. around 940, 1130 and 1400 nm), so the amount reaching you varies with humidity and cloud.',
    biology:
      'Photobiomodulation research studies red/near-IR effects on cells, with cytochrome c oxidase proposed as one absorber. Most evidence comes from controlled light sources at specific wavelengths and doses, not ambient sunlight.',
    safety: 'Contributes to skin heating; very high doses have been linked to skin photo-ageing in laboratory studies.',
  },
  {
    id: 'irb', name: 'Infrared-B', nm: [1400, 3000], color: '#9a3b34', groundPct: 10.19, spacePct: 13.72,
    physics: 'Strongly absorbed by water vapour and CO₂ bands in the atmosphere and by water in the outermost layers of tissue.',
    biology: 'Deposits its energy as heat at the skin surface — the warmth you feel. Warmth is NOT a measure of UV exposure.',
    safety: 'Heat stress, dehydration and heat illness are the main risks on hot, sunny days.',
  },
  {
    id: 'irc', name: 'Infrared-C (to 4 µm)', nm: [3000, 4000], color: '#5e2a2a', groundPct: 0.74, spacePct: 1.13,
    physics:
      'Only a small tail of sunlight. Most long-wave infrared you experience outdoors is thermal emission from the ground, air and your own body, not sunlight.',
    biology: 'Absorbed almost entirely at the skin surface as heat.',
    safety: 'Thermal comfort and heat balance, not photochemistry.',
  },
];

/** ASTM G173-03 spectral irradiance, W·m⁻²·nm⁻¹, mean over 20-nm bins starting at 280 nm. */
export const SPECTRUM_START_NM = 280;
export const SPECTRUM_STEP_NM = 20;

export const AM0: number[] = [0.405, 0.628, 0.908, 0.971, 1.13, 1.08, 1.729, 1.651, 1.973, 2.021, 1.946, 1.873, 1.881, 1.851, 1.834, 1.798, 1.725, 1.664, 1.563, 1.534, 1.461, 1.389, 1.328, 1.275, 1.222, 1.167, 1.115, 1.061, 0.997, 0.965, 0.933, 0.9, 0.864, 0.82, 0.786, 0.761, 0.723, 0.69, 0.661, 0.63, 0.599, 0.585, 0.564, 0.547, 0.526, 0.507, 0.491, 0.474, 0.456, 0.442, 0.42, 0.405, 0.388, 0.374, 0.362, 0.352, 0.338, 0.328, 0.316, 0.307, 0.299, 0.288, 0.281, 0.271, 0.262, 0.253, 0.244, 0.236, 0.226, 0.219, 0.209, 0.203, 0.192, 0.187, 0.18, 0.174, 0.165, 0.16, 0.153, 0.144, 0.143, 0.138, 0.133, 0.126, 0.124, 0.119, 0.115, 0.111, 0.106, 0.102, 0.098, 0.095, 0.092, 0.09, 0.085, 0.084, 0.081, 0.079, 0.076, 0.073, 0.071, 0.069, 0.066, 0.064, 0.062, 0.06, 0.059, 0.057, 0.055, 0.054, 0.051];

export const AM15G: number[] = [0.0, 0.073, 0.37, 0.503, 0.658, 0.687, 1.178, 1.188, 1.485, 1.567, 1.551, 1.517, 1.54, 1.527, 1.495, 1.473, 1.465, 1.427, 1.391, 1.406, 1.278, 1.254, 1.132, 1.232, 0.924, 1.123, 1.006, 0.935, 0.977, 0.955, 0.863, 0.684, 0.487, 0.348, 0.57, 0.726, 0.718, 0.688, 0.655, 0.615, 0.561, 0.363, 0.147, 0.223, 0.414, 0.431, 0.439, 0.461, 0.452, 0.396, 0.407, 0.333, 0.223, 0.05, 0.0, 0.0, 0.005, 0.028, 0.072, 0.083, 0.151, 0.238, 0.27, 0.27, 0.25, 0.249, 0.232, 0.235, 0.22, 0.214, 0.205, 0.196, 0.175, 0.16, 0.137, 0.078, 0.015, 0.001, 0.0, 0.0, 0.0, 0.0, 0.001, 0.01, 0.042, 0.081, 0.03, 0.075, 0.076, 0.069, 0.088, 0.09, 0.089, 0.087, 0.081, 0.079, 0.075, 0.076, 0.071, 0.066, 0.063, 0.06, 0.056, 0.047, 0.044, 0.038, 0.035, 0.03, 0.026, 0.023, 0.005];

export function wavelengthAt(i: number): number {
  return SPECTRUM_START_NM + i * SPECTRUM_STEP_NM + SPECTRUM_STEP_NM / 2;
}

export function bandFor(nm: number): SpectralBand | null {
  return BANDS.find((b) => nm >= b.nm[0] && nm < b.nm[1]) ?? null;
}

/** Approximate sRGB colour for a visible wavelength (for display only). */
export function wavelengthColor(nm: number): string {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const c = (x: number) => Math.round(255 * Math.pow(Math.max(0, x * f), 0.8));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

export interface BandEstimate {
  band: SpectralBand;
  /** W/m², null when no broadband value is available. */
  low: number | null;
  high: number | null;
}

/**
 * Splits a MODELLED broadband global horizontal irradiance (GHI, W/m²) into
 * rough per-band ranges using ASTM G173-03 reference shares. The uncertainty
 * band is deliberately wide: the real split shifts with air mass (low Sun →
 * relatively more red/IR), water vapour and cloud (liquid water absorbs
 * near-IR → relatively less IR under overcast). This is an illustration, not
 * a radiative-transfer calculation and not a measurement.
 */
export function estimateBands(ghi: number | null, cloudCover: number | null): BandEstimate[] {
  const cloudy = cloudCover != null && cloudCover >= 70;
  return BANDS.map((band) => {
    if (ghi == null || ghi <= 0) return { band, low: ghi === 0 ? 0 : null, high: ghi === 0 ? 0 : null };
    const share = band.groundPct / 100;
    let lo = 0.75, hi = 1.25;
    if (band.id === 'uvb') { lo = 0.2; hi = 2.0; } // UV-B varies steeply with ozone & Sun angle
    if (cloudy && (band.id === 'ira' || band.id === 'irb')) { lo = 0.55; hi = 1.05; }
    if (cloudy && band.id === 'visible') { lo = 0.95; hi = 1.3; }
    return { band, low: ghi * share * lo, high: ghi * share * hi };
  });
}

/** Planck spectral radiance ratio helper for a blackbody of temperature T (K), normalised. */
export function planckRelative(nm: number, T = 5772): number {
  const h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
  const l = nm * 1e-9;
  const peak = 2.897771955e-3 / T;
  const B = (x: number) => 1 / (x ** 5 * (Math.exp((h * c) / (x * k * T)) - 1));
  return B(l) / B(peak);
}
