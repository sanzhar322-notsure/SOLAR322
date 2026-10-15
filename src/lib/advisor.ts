/**
 * "What makes sense right now" — a single, conservative, explainable action
 * for the home screen, combining calculated Sun position, UV forecast,
 * modelled weather and the user's own sleep schedule.
 */
import type { SkyPhase, SolarDay } from './astro/solar';
import { parseClock } from './sleep';
import { uvBand } from './uv';
import { heatNote } from './planner';

export interface NowAction {
  id: string;
  title: string;
  detail: string;
  why: string;
  tone: 'sleep' | 'light' | 'protect' | 'caution' | 'neutral';
}

export interface AdvisorInput {
  nowMin: number; // local minutes after midnight
  phase: SkyPhase;
  morning: boolean;
  elevation: number;
  uv: number | null;
  apparentTemp: number | null;
  targetWake: string;
  targetBedtime: string;
  windDownMinutes: number;
  day: SolarDay;
}

function inWindow(now: number, start: number, end: number): boolean {
  // handles windows that wrap past midnight
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export function currentAction(a: AdvisorInput): NowAction {
  const wake = parseClock(a.targetWake) ?? 420;
  const bed = parseClock(a.targetBedtime) ?? 1380;
  const windStart = (bed - a.windDownMinutes + 1440) % 1440;

  if (inWindow(a.nowMin, bed, wake)) {
    return {
      id: 'sleep',
      tone: 'sleep',
      title: 'Sleep window',
      detail: 'Keep lights low and screens away. If you are awake, dim, warm light is kinder than bright overhead light.',
      why: `Inside your planned sleep period (${a.targetBedtime}–${a.targetWake}). Bright light at night can shift the body clock and suppress melatonin.`,
    };
  }
  if (inWindow(a.nowMin, windStart, bed)) {
    return {
      id: 'wind-down',
      tone: 'sleep',
      title: 'Wind-down time',
      detail: 'Dim room lights, lower screen brightness (Night Shift / Reduce White Point), and switch to calmer activities.',
      why: `${a.windDownMinutes} min before your target bedtime ${a.targetBedtime}. Lower evening light supports earlier sleep onset; it is the brightness and timing that matter most, not only the colour.`,
    };
  }
  const heat = heatNote(a.apparentTemp);
  if (a.apparentTemp != null && a.apparentTemp >= 39) {
    return { id: 'heat', tone: 'caution', title: 'Dangerous heat', detail: heat ?? '', why: 'Modelled feels-like temperature is in the danger range; heat illness can develop quickly.' };
  }
  if (a.phase === 'day' || a.phase === 'golden') {
    if (a.uv != null) {
      const band = uvBand(a.uv);
      if (a.uv >= 7.5) {
        return { id: 'uv-very-high', tone: 'protect', title: `UV ${band.label.toLowerCase()} — minimise midday sun`, detail: band.detail, why: `Forecast UV index ≈ ${a.uv.toFixed(1)}. ${band.protection}.` };
      }
      if (a.uv >= 2.5) {
        return { id: 'uv-protect', tone: 'protect', title: `UV ${band.label.toLowerCase()} — protection needed outdoors`, detail: band.detail, why: `Forecast UV index ≈ ${a.uv.toFixed(1)}. Daylight is still useful for your rhythm; shade and cover let you have it without burning.` };
      }
      const morning = a.morning && a.nowMin >= wake - 30;
      return {
        id: morning ? 'morning-light' : 'daylight',
        tone: 'light',
        title: morning ? 'Good moment for morning daylight' : 'Lower-UV daylight',
        detail: morning
          ? 'A short time outdoors after waking gives your eyes bright natural light. No need to look at the Sun — never stare at it.'
          : 'Outdoor daylight is far brighter than indoor light. Dress for the weather; lower UV is not zero UV.',
        why: `Sun ${a.elevation.toFixed(0)}° above the horizon with a forecast UV index of ≈ ${a.uv.toFixed(1)} (low).${heat ? ' ' + heat : ''}`,
      };
    }
    return {
      id: 'uv-unknown',
      tone: 'caution',
      title: 'Daylight — UV data unavailable',
      detail: a.elevation > 45
        ? 'The Sun is high (your shadow is shorter than you): assume UV may be high and use shade, a hat and sunscreen.'
        : 'The Sun is fairly low; UV is usually lower, but use protection for longer exposure.',
      why: `Sun elevation ${a.elevation.toFixed(0)}° (calculated). Without a UV forecast the app will not guess a number.`,
    };
  }
  if (a.phase === 'civil' && a.morning) {
    return { id: 'dawn', tone: 'light', title: 'Civil dawn', detail: 'The sky is brightening before sunrise. Morning light outdoors is available even before the Sun clears the horizon.', why: 'Sun between −6° and the horizon (calculated).' };
  }
  if (a.phase === 'civil' && !a.morning) {
    return { id: 'dusk', tone: 'neutral', title: 'Dusk', detail: 'Natural light is fading. A good cue to start lowering indoor brightness as the evening goes on.', why: 'Sun just below the horizon (calculated).' };
  }
  return {
    id: 'night',
    tone: 'neutral',
    title: a.morning ? 'Before dawn' : 'Evening',
    detail: a.morning ? 'It is still dark outside. If you are up, use bright indoor light to wake and save outdoor light for after dawn.' : 'Keep evening lighting moderate; brighter is not better at this hour.',
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
      const hh = String(Math.floor(windStart / 60)).padStart(2, '0'), mm = String(windStart % 60).padStart(2, '0');
      return { id: 'wind-down-soon', text: `Wind-down begins at ${hh}:${mm} (in ${Math.round(until)} min). Start dimming lights and screens.` };
    }
  }
  if (r.morningOn && r.sunUp) {
    const since = (r.nowMin - wake + 1440) % 1440;
    if (since <= 120) return { id: 'morning-light', text: 'Morning daylight reminder: a few minutes outdoors gives your eyes bright natural light. Check the UV card before longer exposure.' };
  }
  return null;
}
