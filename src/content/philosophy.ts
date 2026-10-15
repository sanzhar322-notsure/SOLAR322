/**
 * Solar Philosophy — ideas from Ray Peat and Jack Kruse, each read through
 * three layers:
 *   1. The original idea   — what the thinker proposed (paraphrased, linked).
 *   2. The evidence        — what independent research supports, contradicts
 *                            or has not adequately tested.
 *   3. Practical reading   — what you can reasonably observe or explore.
 * plus a fourth: how the concept connects to YOUR sky right now, computed
 * from calculated, modelled or estimated data (each line labelled).
 *
 * Proponents are paraphrased, never quoted. Source ids refer to
 * content/sources.ts; evidence-card ids to content/evidence.ts.
 */
import type { Level } from './evidence';
import { airMass } from '../lib/astro/solar';
import { estimateBands } from '../lib/spectrum';
import type { DataKind } from '../lib/data/types';

export type Thinker = 'peat' | 'kruse' | 'both';
export type Theme = 'light' | 'darkness' | 'spectrum' | 'infrared' | 'temperature' | 'metabolism' | 'water' | 'seasons' | 'environment';

export interface SkyContext {
  now: number;
  fmt: (t: number) => string;
  elevation: number | null;
  noonElevation: number | null;
  sunrise: number | null;
  sunset: number | null;
  civilDawn: number | null;
  civilDusk: number | null;
  daylightMs: number | null;
  daylightChange30dMin: number | null;
  ghi: number | null;
  cloud: number | null;
  uv: number | null;
  uvPeak: { uv: number; t: number } | null;
  temperature: number | null;
  apparentTemp: number | null;
  targetWake: string;
  targetBedtime: string;
  windDownStart: string;
  /** Minutes between sunset and target bedtime (artificial-light evening). */
  eveningAfterSunsetMin: number | null;
  /** Ratio of erythemal UV to global irradiance now vs. at solar noon (model). */
  uvShareNowVsNoon: number | null;
}

export interface SkyLine { text: string; kind: DataKind | 'unavailable' }

export interface Concept {
  id: string;
  title: string;
  thinker: Thinker;
  themes: Theme[];
  original: string;
  originalSources: string[];
  supports: string[];
  contradicts: string[];
  untested: string[];
  evidenceSources: string[];
  level: Level;
  practical: string[];
  relatedCards: string[];
  sky: (c: SkyContext) => SkyLine[];
}

export const THINKER_LABEL: Record<Thinker, string> = { peat: 'Ray Peat', kruse: 'Jack Kruse', both: 'Peat & Kruse' };
export const THEME_LABEL: Record<Theme, string> = {
  light: 'Light', darkness: 'Darkness', spectrum: 'Spectrum', infrared: 'Infrared', temperature: 'Temperature',
  metabolism: 'Metabolism', water: 'Water', seasons: 'Seasons', environment: 'Environment',
};

const dur = (min: number) => (Math.abs(min) >= 60 ? `${Math.floor(Math.abs(min) / 60)} h ${String(Math.round(Math.abs(min) % 60)).padStart(2, '0')} min` : `${Math.round(Math.abs(min))} min`);
const unavailable = (what: string): SkyLine => ({ text: `${what}: unavailable right now.`, kind: 'unavailable' });

export const CONCEPTS: Concept[] = [
  {
    id: 'light-as-signal',
    title: 'Light as a metabolic signal',
    thinker: 'peat',
    themes: ['light', 'metabolism'],
    original:
      'Peat treated light as a direct physiological influence, not just a visual one. He argued that light — together with thyroid hormone — supports the activity of the respiratory enzyme cytochrome oxidase, favouring efficient oxidative energy production over lactic-acid–producing stress metabolism, and that red light is especially restorative.',
    originalSources: ['peat-mito', 'peat-radiation-2011'],
    supports: [
      'Cytochrome c oxidase absorbs red and near-infrared light, and cell studies show light can change mitochondrial activity (Karu 1999; Hamblin 2017).',
      'Daylight is a powerful regulator of human physiology through the eyes — circadian timing, alertness and melatonin (Brown 2022).',
    ],
    contradicts: ['Little direct evidence that everyday ambient light changes whole-body metabolic rate in healthy people.'],
    untested: ['Whether ordinary outdoor light, at realistic doses, meaningfully shifts the oxidative-vs-glycolytic balance Peat described.'],
    evidenceSources: ['karu-1999', 'hamblin-2017', 'brown-2022'],
    level: 'preliminary',
    practical: [
      'Notice the difference between bright outdoor days and dim indoor days in your journal — energy, mood, appetite.',
      'Treat claims of a metabolic effect from daylight as a hypothesis to observe, not a measurement the app can make.',
    ],
    relatedCards: ['peat-light-respiration', 'pbm', 'light-timing'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.elevation != null) out.push({ text: `Sun ${c.elevation.toFixed(0)}° above the horizon.`, kind: 'calculated' });
      out.push(c.ghi != null ? { text: `Sunlight reaching the ground ≈ ${Math.round(c.ghi)} W/m² (model, hourly mean).`, kind: 'modeled' } : unavailable('Modelled sunlight'));
      if (c.cloud != null) out.push({ text: `Cloud cover ${Math.round(c.cloud)}%.`, kind: 'modeled' });
      return out;
    },
  },
  {
    id: 'darkness-night',
    title: 'Darkness, stress and the night',
    thinker: 'peat',
    themes: ['darkness', 'metabolism'],
    original:
      'Peat is widely reported to have regarded prolonged darkness as a stressor, linked to rising stress hormones and catabolic processes, and to have favoured more light in daily life. The primary passage for this wording was not located in this build.',
    originalSources: ['peat-radiation-2011'],
    supports: ['Long winter nights and low daytime light are associated with seasonal low mood in some people (bright-light therapy is used clinically for seasonal depression).'],
    contradicts: [
      'Darkness at night supports normal melatonin secretion and sleep; consensus recommendations call for a dark sleep environment (≤ ~1 lux) (Brown 2022).',
      'Light at night suppresses melatonin and shifts the body clock.',
    ],
    untested: ['Whether the “stress of darkness” Peat described applies to darkness during sleep, or mainly to dim days and long winters.'],
    evidenceSources: ['brown-2022', 'lucas-2014'],
    level: 'disputed',
    practical: [
      'A reconciling reading: maximise daylight and brightness during the day; keep the night itself dark for sleep.',
      'Track winter mornings vs summer mornings in your journal if long nights affect you.',
    ],
    relatedCards: ['peat-darkness', 'melanopic-recs'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.sunset != null) out.push({ text: `Sunset ${c.fmt(c.sunset)}${c.civilDusk ? `, civil dusk ${c.fmt(c.civilDusk)}` : ''}.`, kind: 'calculated' });
      if (c.eveningAfterSunsetMin != null) out.push({ text: `${dur(c.eveningAfterSunsetMin)} between sunset and your bedtime (${c.targetBedtime}) — the artificially lit part of your day.`, kind: 'calculated' });
      if (c.daylightMs != null) out.push({ text: `Night length today ≈ ${dur(24 * 60 - c.daylightMs / 60000)}.`, kind: 'calculated' });
      return out;
    },
  },
  {
    id: 'warmth-thyroid',
    title: 'Warmth, thyroid and metabolic rate',
    thinker: 'peat',
    themes: ['temperature', 'metabolism'],
    original:
      'Peat placed thyroid function at the centre of metabolic health. He read body temperature together with resting pulse (and other signs) as practical indicators of metabolic rate, cautioning that each indicator must be interpreted in context, and was sceptical of relying on TSH alone.',
    originalSources: ['peat-hypothyroid', 'peat-thyroid-fraud'],
    supports: [
      'Thyroid hormone is a major regulator of basal metabolic rate and thermogenesis (Mullur 2014).',
      'A 2020 opinion article proposes thyroid-dependent thermoregulation as a testable explanation for the reported long-term fall in average body temperature (Vancamp & Demeneix 2020).',
    ],
    contradicts: ['Clinical diagnosis relies on blood tests; temperature and pulse alone are not validated diagnostic tools for hypothyroidism.'],
    untested: ['Whether self-tracked temperature and pulse can reliably guide thyroid decisions — Peat’s approach has not been tested in trials.'],
    evidenceSources: ['mullur-2014', 'vancamp-2020'],
    level: 'insufficient',
    practical: [
      'If you track morning temperature or pulse, record them in journal notes as observations — not as a diagnosis.',
      'Thyroid questions belong with a clinician and blood tests; don’t self-medicate thyroid hormone.',
    ],
    relatedCards: ['peat-thyroid'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.temperature != null) out.push({ text: `Air temperature ${Math.round(c.temperature)} °C, feels like ${c.apparentTemp != null ? Math.round(c.apparentTemp) : '—'} °C.`, kind: 'modeled' });
      else out.push(unavailable('Air temperature'));
      out.push({ text: 'The app does not — and cannot — infer your metabolic rate or thyroid status from weather.', kind: 'calculated' });
      return out;
    },
  },
  {
    id: 'food-stress',
    title: 'Food, stress and the physiological environment',
    thinker: 'peat',
    themes: ['metabolism'],
    original:
      'Peat argued that diet shapes the stress response: he regarded polyunsaturated vegetable oils as suppressing thyroid function and mitochondrial energy production, and favoured foods he considered protective, such as gelatin, alongside sugars from fruit and milk.',
    originalSources: ['peat-oils', 'peat-gelatin'],
    supports: ['Oxidation products of polyunsaturated fats can be harmful in some laboratory conditions.'],
    contradicts: ['Major nutrition bodies recommend replacing saturated with polyunsaturated fat to reduce cardiovascular disease, based on trials and cohorts (Sacks 2017).'],
    untested: ['Most of Peat’s specific dietary claims have not been tested in controlled human trials.'],
    evidenceSources: ['sacks-2017'],
    level: 'disputed',
    practical: ['Outside what this app measures. If you experiment with diet, use the Experiments tool to log a baseline and one change at a time, and discuss major changes with a professional.'],
    relatedCards: ['peat-pufa'],
    sky: () => [{ text: 'Not tied to sky conditions — this concept concerns diet rather than light.', kind: 'calculated' }],
  },
  {
    id: 'sunrise-signal',
    title: 'Sunrise as the master timing signal',
    thinker: 'kruse',
    themes: ['light', 'spectrum'],
    original:
      'Kruse places morning sunlight — ideally from around sunrise, including its UV-A component — at the centre of circadian health, describing AM light as the signal that sets the body’s clocks and hormonal rhythms.',
    originalSources: ['kruse-tensegrity2', 'kruse-time11'],
    supports: [
      'Morning light advances the human circadian clock; natural light-dark exposure moves timing earlier (Wright 2013; Brown 2022).',
      'UV-A at very low intensities can reset the clock in fruit flies (Negelspach 2018).',
    ],
    contradicts: ['No human trial shows UV-A specifically is required; in adults the lens absorbs most UV before it reaches the retina. Daylight later in the morning also entrains.'],
    untested: ['Whether being outside at sunrise itself, rather than any bright morning light, adds benefit in humans.'],
    evidenceSources: ['wright-2013', 'brown-2022', 'negelspach-2018'],
    level: 'supported',
    practical: [
      'A consistent morning outdoor routine is easy to test: log morning minutes and alertness for a few weeks.',
      'If sunrise is earlier than your wake time, the principle still applies to the first daylight after waking.',
    ],
    relatedCards: ['kruse-am-light', 'light-timing', 'camping'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.sunrise != null) out.push({ text: `Sunrise ${c.fmt(c.sunrise)}${c.civilDawn ? ` (civil dawn ${c.fmt(c.civilDawn)})` : ''}; your target wake is ${c.targetWake}.`, kind: 'calculated' });
      else out.push({ text: 'No sunrise today at this latitude.', kind: 'calculated' });
      if (c.cloud != null) out.push({ text: `Cloud cover ${Math.round(c.cloud)}% — outdoor light under cloud is still typically far brighter than indoors.`, kind: 'modeled' });
      if (c.daylightChange30dMin != null) out.push({ text: `Day length will change by ${c.daylightChange30dMin >= 0 ? '+' : '−'}${dur(c.daylightChange30dMin)} over the next 30 days.`, kind: 'calculated' });
      return out;
    },
  },
  {
    id: 'spectrum-package',
    title: 'Sunlight as a full-spectrum package',
    thinker: 'kruse',
    themes: ['spectrum', 'light', 'infrared'],
    original:
      'Kruse argues that sunlight should be understood as a balanced package of UV, visible and infrared light that changes through the day, and that artificial light lacks this balance — blue-rich without the accompanying UV and infrared.',
    originalSources: ['kruse-time8', 'kruse-time7', 'kruse-ub24'],
    supports: [
      'The solar spectrum does change with Sun angle and atmosphere: low Sun means relatively less UV-B and blue, relatively more red (ASTM G173 reference; air-mass physics).',
      'Different bands interact with tissue differently: UV-B drives vitamin D synthesis; red/near-IR penetrate deeper (Holick 2007; Barolet 2016).',
    ],
    contradicts: ['No human evidence that artificial light “without balancing UV/IR” causes disease through the mechanisms Kruse proposes.'],
    untested: ['Whether the proportions of bands, rather than total light dose, matter for human circadian or metabolic outcomes.'],
    evidenceSources: ['astm-g173', 'holick-2007', 'barolet-2016', 'cochrane-2023'],
    level: 'preliminary',
    practical: ['Use the Spectrum Lab to see how the UV share of sunlight changes over your day, and which bands the data can and cannot describe.'],
    relatedCards: ['kruse-blue-disease', 'vitamin-d'],
    sky: (c) => {
      const out: SkyLine[] = [];
      const am = c.elevation != null && c.elevation > 0 ? airMass(c.elevation) : null;
      if (am != null) out.push({ text: `Air mass ≈ ${am.toFixed(1)} (1.0 = Sun overhead): ${am > 2.5 ? 'a long path — relatively redder light, much reduced UV-B' : am > 1.5 ? 'a moderate path' : 'a short path — near the day’s maximum UV-B share'}.`, kind: 'calculated' });
      else out.push({ text: 'Sun below the horizon — no direct solar spectrum now.', kind: 'calculated' });
      if (c.uvShareNowVsNoon != null) out.push({ text: `UV makes up ≈ ${Math.round(c.uvShareNowVsNoon * 100)}% of its solar-noon share of sunlight right now (model ratio).`, kind: 'modeled' });
      if (c.noonElevation != null) {
        const n = c.noonElevation;
        const desc = n >= 45 ? 'high — substantial UV-B around midday'
          : n >= 30 ? 'moderate — UV-B is present around midday but reduced'
          : 'low — little UV-B even at midday (the “vitamin D winter” pattern)';
        out.push({ text: `Noon Sun ${n.toFixed(0)}°: ${desc} (rule of thumb).`, kind: 'calculated' });
      }
      return out;
    },
  },
  {
    id: 'infrared-mitochondria',
    title: 'Red and infrared light, and mitochondria',
    thinker: 'both',
    themes: ['infrared', 'metabolism'],
    original:
      'Both thinkers give infrared and red light a special role. Peat emphasised red light supporting respiration and healing; Kruse describes mitochondria as light-sensitive and links solar infrared to mitochondrial function and structured water.',
    originalSources: ['peat-radiation-2011', 'kruse-ub8'],
    supports: [
      'Photobiomodulation research: red/near-IR light can affect cell function; cytochrome c oxidase is a proposed absorber (Karu 1999; Hamblin 2017).',
      'A small study found 670 nm light improved colour-contrast sensitivity in older adults (Shinhmar 2020).',
    ],
    contradicts: ['Potential skin harms from intense infrared at high doses (Barolet 2016).', 'Most positive studies use devices at defined wavelengths and doses, not ambient sunlight.'],
    untested: ['Whether near-IR from ordinary sunlight, at the times and doses people actually receive, produces measurable mitochondrial benefits in humans.'],
    evidenceSources: ['karu-1999', 'hamblin-2017', 'shinhmar-2020', 'barolet-2016'],
    level: 'preliminary',
    practical: ['The app can show an estimated infrared range from modelled sunlight — never a measured value, and never a “dose” for your mitochondria.'],
    relatedCards: ['pbm', 'peat-light-respiration', 'kruse-biophotons'],
    sky: (c) => {
      if (c.ghi == null) return [unavailable('Infrared estimate (no modelled sunlight)')];
      if (c.ghi <= 0) return [{ text: 'No modelled sunlight right now, so no solar infrared estimate.', kind: 'modeled' }];
      const ira = estimateBands(c.ghi, c.cloud).find((b) => b.band.id === 'ira')!;
      return [
        { text: `Near-infrared (780–1400 nm) roughly ${Math.round(ira.low!)}–${Math.round(ira.high!)} W/m² — a wide-range estimate from modelled total sunlight, not a measurement.`, kind: 'estimated' },
        { text: 'Measured spectral infrared for your location: not available from any provider.', kind: 'unavailable' },
      ];
    },
  },
  {
    id: 'light-water',
    title: 'Light, water and the cell',
    thinker: 'kruse',
    themes: ['water', 'light', 'infrared'],
    original:
      'Kruse argues that light — particularly infrared — interacts with water around mitochondria and cell membranes to form “exclusion zone” (EZ) water, building on Gerald Pollack’s work, and treats this as central to cellular energy and health.',
    originalSources: ['kruse-ee13', 'kruse-tensegrity12'],
    supports: ['An exclusion-zone effect near hydrophilic surfaces — microspheres pushed away from the surface — has been observed experimentally.'],
    contradicts: ['A 2020 critical review argues the core EZ phenomenon is better explained by diffusiophoresis than by a new phase of water, and notes difficulties with the light-driven charge-separation idea (Elton et al. 2020).'],
    untested: ['No human evidence links EZ water around mitochondria to health outcomes.'],
    evidenceSources: ['elton-2020'],
    level: 'insufficient',
    practical: ['A speculative frontier. Interesting to read about, but not something the app can relate to your measurements.'],
    relatedCards: ['kruse-biophotons'],
    sky: () => [{ text: 'No environmental data bears directly on this hypothesis.', kind: 'calculated' }],
  },
  {
    id: 'cold-seasons',
    title: 'Cold, seasons and temperature as a signal',
    thinker: 'kruse',
    themes: ['temperature', 'seasons'],
    original:
      'Kruse argues that temperature, not only light, tells the body what season it is, and promotes deliberate cold exposure (“cold thermogenesis”) — including a skin-temperature target — as a way to reset metabolism and leptin signalling.',
    originalSources: ['kruse-ct2', 'kruse-ct6', 'kruse-ctprotocol'],
    supports: ['A 2022 review of 104 studies found some physiological effects of cold-water immersion, such as on adipose tissue and insulin sensitivity (Espeland 2022).'],
    contradicts: ['The same review found mostly small, heterogeneous studies and could not establish health benefits; winter swimmers may differ from others to begin with.'],
    untested: ['Kruse’s specific seasonal and leptin mechanisms have not been tested in controlled human trials.'],
    evidenceSources: ['espeland-2022'],
    level: 'preliminary',
    practical: [
      'Seasonal change is visible in your own data: day length, temperature and your energy logs.',
      'If you explore cold exposure, start mild and never alone — cold shock is a real risk, especially with heart conditions.',
    ],
    relatedCards: ['kruse-cold'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.temperature != null) out.push({ text: `Air temperature ${Math.round(c.temperature)} °C (feels like ${c.apparentTemp != null ? Math.round(c.apparentTemp) : '—'} °C).`, kind: 'modeled' });
      else out.push(unavailable('Air temperature'));
      if (c.daylightMs != null) out.push({ text: `Day length ${dur(c.daylightMs / 60000)}${c.daylightChange30dMin != null ? `, ${c.daylightChange30dMin >= 0 ? 'lengthening' : 'shortening'} by ${dur(c.daylightChange30dMin)} over 30 days` : ''}.`, kind: 'calculated' });
      return out;
    },
  },
  {
    id: 'artificial-environment',
    title: 'The artificial environment: night light and nnEMF',
    thinker: 'kruse',
    themes: ['environment', 'darkness'],
    original:
      'Kruse argues that modern environments disrupt biology through artificial light after sunset and through non-native electromagnetic fields (Wi-Fi, Bluetooth, mobile networks), which he links to mitochondrial dysfunction.',
    originalSources: ['kruse-time8', 'kruse-5g'],
    supports: ['Bright evening light, including screens, can delay sleep and melatonin (Chang 2015; Brown 2022).'],
    contradicts: [
      'Public-health assessments have not established health effects from radio-frequency exposure below guideline limits (WHO).',
      'Blue-filtering glasses probably don’t improve sleep (Cochrane 2023) — brightness and timing matter more than colour.',
    ],
    untested: ['The proposed mitochondrial mechanisms for both claims.'],
    evidenceSources: ['chang-2015', 'brown-2022', 'who-emf', 'cochrane-2023'],
    level: 'disputed',
    practical: [
      'The evening-light half is well supported: dimmer evenings are worth trying. The EMF half lacks evidence.',
      'Putting the phone away at night still helps sleep — through light, alerts and arousal.',
    ],
    relatedCards: ['kruse-evening-blue', 'kruse-nnemf', 'screens'],
    sky: (c) => {
      const out: SkyLine[] = [];
      if (c.sunset != null) out.push({ text: `Sunset ${c.fmt(c.sunset)}; your wind-down starts ${c.windDownStart}.`, kind: 'calculated' });
      if (c.eveningAfterSunsetMin != null) out.push({ text: `${dur(c.eveningAfterSunsetMin)} of evening between sunset and bedtime.`, kind: 'calculated' });
      return out;
    },
  },
];

/** Concepts most connected to the current moment of the solar day. */
export function conceptsForNow(elevation: number | null, morning: boolean): string[] {
  if (elevation == null) return ['sunrise-signal', 'light-as-signal'];
  if (elevation < -6) return morning ? ['sunrise-signal', 'darkness-night'] : ['darkness-night', 'artificial-environment'];
  if (elevation < 15) return morning ? ['sunrise-signal', 'spectrum-package'] : ['artificial-environment', 'spectrum-package'];
  return ['spectrum-package', 'infrared-mitochondria'];
}
