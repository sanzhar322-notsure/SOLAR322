/**
 * "Right now" — one contextual observation for the home screen, built from
 * calculated Sun position, forecast UV, modelled weather and the user's own
 * schedule and priorities. It explains what is happening and why it is shown;
 * it does not issue blanket commands, and it never infers hormones,
 * mitochondrial function or metabolism from weather data.
 */
import type { SkyPhase, SolarDay } from './astro/solar';
import { parseClock } from './sleep';
import { heatSentence, uvSentence, windowThreshold } from './planner';
import type { PriorityKey } from '../state/settings';

export interface NowAction {
  id: string;
  title: string;
  detail: string;
  why: string;
  tone: 'sleep' | 'light' | 'protect' | 'caution' | 'neutral';
  /** Data points the message is built from, shown as chips. */
  facts: string[];
}

export interface AdvisorInput {
  now?: number;
  nowMin: number; // local minutes after midnight
  phase: SkyPhase;
  morning: boolean;
  elevation: number;
  uv: number | null;
  uvPeak?: { uv: number; t: number } | null;
  cloud?: number | null;
  apparentTemp: number | null;
  targetWake: string;
  targetBedtime: string;
  windDownMinutes: number;
  day: SolarDay;
  priorities?: PriorityKey[];
  formatTime?: (t: number) => string;
}

function inWindow(now: number, start: number, end: number): boolean {
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

const hm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(Math.round((((m % 1440) + 1440) % 1440) % 60)).padStart(2, '0')}`;
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

export function currentAction(a: AdvisorInput): NowAction {
  const f = a.formatTime ?? ((t: number) => new Date(t).toISOString().slice(11, 16));
  const pr = a.priorities ?? [];
  const wake = parseClock(a.targetWake) ?? 420;
  const bed = parseClock(a.targetBedtime) ?? 1380;
  const windStart = (bed - a.windDownMinutes + 1440) % 1440;
  const d = a.day;
  const facts: string[] = [];
  if (d.sunrise) facts.push(`Sunrise ${f(d.sunrise)}`);
  if (d.sunset) facts.push(`Sunset ${f(d.sunset)}`);
  facts.push(`Sun ${a.elevation >= 0 ? '+' : ''}${a.elevation.toFixed(0)}°`);
  if (a.cloud != null) facts.push(`Cloud ${Math.round(a.cloud)}%`);
  if (a.uv != null) facts.push(`UV ${a.uv.toFixed(1)}`);

  if (inWindow(a.nowMin, bed, wake)) {
    return {
      id: 'sleep', tone: 'sleep', facts,
      title: 'Night — your sleep window',
      detail: 'If you’re awake, dim and warm light is gentler on the night than overhead lighting or a bright screen.',
      why: `Inside your planned sleep period (${a.targetBedtime}–${a.targetWake}).`,
    };
  }
  if (inWindow(a.nowMin, windStart, bed)) {
    return {
      id: 'wind-down', tone: 'sleep', facts,
      title: 'Wind-down',
      detail: `${d.sunset ? `The Sun set at ${f(d.sunset)}. ` : ''}Bedtime is ${a.targetBedtime}: a good stretch to lower brightness gradually — lamps instead of overheads, dimmer screens.`,
      why: `Starts ${a.windDownMinutes} min before your target bedtime. Light intensity and timing in the evening affect circadian timing; the colour of light matters less than how bright it is.`,
    };
  }

  const heat = heatSentence(a.apparentTemp, false);
  if (heat && heat.weight === 'important') {
    return { id: 'heat', tone: 'caution', facts, title: 'Strong heat', detail: heat.text, why: 'Modelled feels-like temperature for your location.' };
  }

  const up = a.phase === 'day' || a.phase === 'golden';
  const threshold = windowThreshold(d.noonElevation);
  const uvLine = a.uvPeak ? uvSentence(a.uvPeak.uv, f(a.uvPeak.t)) : null;

  if (up && a.morning && a.elevation < threshold) {
    const since = d.sunrise ? Math.round(((a.now ?? Date.now()) - d.sunrise) / 60000) : null;
    const startDay = a.nowMin >= wake - 30
      ? `You planned to begin your day at ${a.targetWake} — a natural point for time outside, building a consistent morning routine.`
      : `Your planned wake time is ${a.targetWake}.`;
    return {
      id: 'morning-window', tone: 'light', facts,
      title: 'Morning solar window',
      detail: `${d.sunrise ? `Sunrise was at ${f(d.sunrise)}; ` : ''}the Sun is ${a.elevation.toFixed(0)}° up and climbing. ${startDay}${a.cloud != null ? ` Cloud cover ${Math.round(a.cloud)}%.` : ''}`,
      why: `Sun below ${Math.round(threshold)}° and rising (calculated)${since != null && since > 0 && since < 600 ? `, ${dur(since)} after sunrise` : ''}. Daylight reaching the eyes early in the day is one of the strongest timing signals for the body clock.`,
    };
  }
  if (up && a.elevation >= threshold) {
    const nearPeak = d.noonElevation != null && a.elevation >= d.noonElevation - 5;
    const parts: string[] = [];
    parts.push(nearPeak
      ? `Solar elevation ${a.elevation.toFixed(0)}° — near its daily maximum of ${d.noonElevation!.toFixed(0)}°${d.solarNoon ? ` at ${f(d.solarNoon)}` : ''}.`
      : `Sun ${a.elevation.toFixed(0)}° and ${a.morning ? 'rising' : 'descending'}; maximum ${d.noonElevation?.toFixed(0) ?? '—'}°${d.solarNoon ? ` at ${f(d.solarNoon)}` : ''}.`);
    if (uvLine) parts.push(uvLine.text);
    else if (a.uv == null) parts.push(a.elevation > 50 ? 'No UV forecast right now; with the Sun this high, UV is usually substantial under clear skies.' : 'No UV forecast right now.');
    if (pr.includes('activity') && a.apparentTemp != null && a.apparentTemp > 8 && a.apparentTemp < 28) parts.push(`Comfortable for activity: feels like ${Math.round(a.apparentTemp)} °C.`);
    if (heat) parts.push(heat.text);
    const tone = uvLine?.weight === 'important' ? 'protect' : 'light';
    return {
      id: nearPeak ? 'midday' : 'daytime', tone, facts,
      title: nearPeak ? 'Sun near its daily high' : 'Daytime solar window',
      detail: parts.join(' '),
      why: `Sun above ${Math.round(threshold)}° (calculated); UV values are model forecasts. How long you stay out matters as much as when.`,
    };
  }
  if (up && !a.morning) {
    const toSet = d.sunset ? Math.max(0, Math.round((d.sunset - (a.now ?? Date.now())) / 60000)) : null;
    return {
      id: 'evening-window', tone: 'light', facts,
      title: 'Afternoon & evening window',
      detail: `Daylight is declining${toSet != null ? ` — sunset at ${f(d.sunset!)}, ${dur(toSet)} away` : ''}. Your target bedtime is ${a.targetBedtime}; this is a natural time to complete outdoor activities and let the evening transition toward dimmer light.`,
      why: `Sun below ${Math.round(threshold)}° and descending (calculated).`,
    };
  }
  if (a.phase === 'civil' && a.morning) {
    return {
      id: 'dawn', tone: 'light', facts,
      title: 'Civil dawn',
      detail: `The sky is brightening${d.sunrise ? `; sunrise at ${f(d.sunrise)}` : ''}. Outdoor light is already far brighter than most rooms.`,
      why: 'Sun between −6° and the horizon (calculated).',
    };
  }
  if (a.phase === 'civil') {
    return { id: 'dusk', tone: 'neutral', facts, title: 'Dusk', detail: `Natural light is fading. Wind-down begins at ${hm(windStart)}.`, why: 'Sun just below the horizon (calculated).' };
  }
  if (a.morning) {
    return {
      id: 'pre-dawn', tone: 'neutral', facts,
      title: 'Before dawn',
      detail: `It’s still dark${d.civilDawn ? `; civil dawn at ${f(d.civilDawn)}${d.sunrise ? `, sunrise ${f(d.sunrise)}` : ''}` : ''}. If you’re up, bright indoor light helps you wake until there’s daylight outside.`,
      why: 'Sun well below the horizon (calculated).',
    };
  }
  return {
    id: 'evening', tone: 'neutral', facts,
    title: 'Evening',
    detail: `Wind-down begins at ${hm(windStart)}. Moderate lighting now makes the later transition to dim light easier.`,
    why: 'Sun well below the horizon (calculated).',
  };
}

export interface ReminderInput {
  nowMin: number;
  targetWake: string;
  targetBedtime: string;
  windDownMinutes: number;
  windDownOn: boolean;
  morningOn: boolean;
  sunUp: boolean;
}

/** In-app reminder shown while the app is open (web apps cannot notify while closed on iOS without a push server). */
export function upcomingReminder(r: ReminderInput): { id: string; text: string } | null {
  const wake = parseClock(r.targetWake) ?? 420;
  const bed = parseClock(r.targetBedtime) ?? 1380;
  const windStart = (bed - r.windDownMinutes + 1440) % 1440;
  if (r.windDownOn) {
    const until = (windStart - r.nowMin + 1440) % 1440;
    if (until > 0 && until <= 30) {
      return { id: 'wind-down-soon', text: `Wind-down begins at ${hm(windStart)} (in ${Math.round(until)} min).` };
    }
  }
  if (r.morningOn && r.sunUp) {
    const since = (r.nowMin - wake + 1440) % 1440;
    if (since <= 120) return { id: 'morning-light', text: 'Morning daylight: the Sun is up — a few minutes outside fits your morning routine.' };
  }
  return null;
}
