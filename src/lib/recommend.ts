/**
 * Transparent, rule-based routine suggestions. Each rule reports what it
 * observed, what it suggests, why, how confident it is (with the reason), and
 * what to test next. Nothing is applied automatically: suggestions carrying an
 * `action` are applied only if the user accepts or modifies them.
 */
import type { DailyEntry, Decision, OutdoorSession } from '../state/journal';
import type { Settings } from '../state/settings';
import {
  bedtimeFor, forwardMinutes, gradualStep, mean, parseClock, plannedOpportunity, sleepMetrics, summarize, toClock,
} from './sleep';

export type Confidence = 'low' | 'moderate' | 'higher';

export interface ScheduleAction { targetWake: string; targetBedtime: string }

export interface Recommendation {
  id: string;
  title: string;
  observed: string;
  suggestion: string;
  rationale: string;
  confidence: Confidence;
  confidenceWhy: string;
  testNext: string;
  priority: number; // lower = more important
  action?: ScheduleAction;
  kind: 'sleep' | 'light' | 'pattern' | 'season' | 'info';
}

export interface RecommendContext {
  entries: DailyEntry[];
  sessions: OutdoorSession[];
  decisions: Decision[];
  settings: Settings['sleep'];
  today: string; // YYYY-MM-DD in the location zone
  now: number;
  /** Today's sunrise (minutes after local midnight), null in polar night/day. */
  sunriseMin: number | null;
  /** Sunrise in ~30 days, for the seasonal trend. */
  sunriseIn30Min: number | null;
  daylightTodayMin: number | null;
  daylightIn30Min: number | null;
  /** Next lower-UV window label for missed-session suggestions. */
  nextWindowText: string | null;
}

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

function nightsConfidence(n: number): { c: Confidence; why: string } {
  if (n >= 10) return { c: 'higher', why: `Based on ${n} logged nights of your own data (direct observation, not a causal finding).` };
  if (n >= 5) return { c: 'moderate', why: `Based on ${n} logged nights — enough to see a pattern, not enough to be sure it is stable.` };
  return { c: 'low', why: `Only ${n} logged nights — this may not reflect your usual pattern.` };
}

function groupConfidence(a: number, b: number): { c: Confidence; why: string } {
  const n = Math.min(a, b);
  if (n >= 8) return { c: 'moderate', why: `Association across ${a} vs ${b} days. Correlational only — other factors may explain it.` };
  return { c: 'low', why: `Association across only ${a} vs ${b} days, and correlational — could be chance or another factor.` };
}

export function isDismissed(id: string, decisions: Decision[], now: number, days = 7): boolean {
  const last = [...decisions].reverse().find((d) => d.ruleId === id);
  return !!last && last.decision === 'dismissed' && now - last.at < days * 86400000;
}

export function recommend(ctx: RecommendContext): Recommendation[] {
  const out: Recommendation[] = [];
  const need = ctx.settings.sleepNeedHours;
  const needMin = need * 60;
  const wk = summarize(ctx.entries, ctx.today, 7, need);
  const two = summarize(ctx.entries, ctx.today, 14, need);
  const targetWake = parseClock(ctx.settings.targetWake) ?? 420;
  const targetBed = parseClock(ctx.settings.targetBedtime) ?? 1380;

  // 1. Not enough data yet.
  if (two.nights < 3) {
    out.push({
      id: 'need-data',
      kind: 'info',
      title: 'Build a baseline',
      observed: two.nights === 0 ? 'No sleep entries in the last two weeks.' : `Only ${two.nights} night(s) logged in the last two weeks.`,
      suggestion: 'Log bedtime, wake time and how you feel for at least 5–7 mornings. Every field except the date is optional.',
      rationale: 'Personal suggestions need your own baseline; until then only general guidance applies.',
      confidence: 'low',
      confidenceWhy: 'Insufficient personal data.',
      testNext: 'A 30-second morning log is enough: wake time, rough bedtime, sleep quality.',
      priority: 5,
    });
  }

  // 2. Planned schedule does not allow enough sleep.
  const opp = plannedOpportunity(ctx.settings.targetBedtime, ctx.settings.targetWake);
  if (opp > 0 && opp < needMin) {
    const bed = bedtimeFor(ctx.settings.targetWake, need, 0);
    const stepBed = toClock(targetBed - Math.min(30, needMin - opp));
    out.push({
      id: 'plan-too-short',
      kind: 'sleep',
      title: 'Your planned schedule is shorter than your sleep need',
      observed: `Target bedtime ${ctx.settings.targetBedtime} → wake ${ctx.settings.targetWake} gives ${fmtH(opp)} in bed, but you set a need of ${need} h.`,
      suggestion: `Move the target bedtime earlier toward ${bed}, in steps of about 15–30 min (first step: ${stepBed}).`,
      rationale: 'Time in bed caps sleep. Most adults need roughly 7–9 h (AASM/SRS consensus); sleep usually takes a little longer than the time asleep.',
      confidence: 'higher',
      confidenceWhy: 'Arithmetic on your own targets; the 7–9 h range is a well-established population guideline.',
      testNext: 'Try the earlier bedtime for a week and log sleep duration and daytime energy.',
      priority: 1,
      action: { targetWake: ctx.settings.targetWake, targetBedtime: stepBed },
    });
  }

  // 3. Short sleep — protect duration before chasing earlier wake-ups.
  if (wk.nights >= 3 && wk.avgSleepMin != null && (wk.avgSleepMin < needMin - 30 || wk.shortNights >= 3)) {
    const conf = nightsConfidence(wk.nights);
    const newBed = toClock(targetBed - 15);
    out.push({
      id: 'short-sleep',
      kind: 'sleep',
      title: 'Prioritise sleep duration',
      observed: `Average sleep over the last 7 days: ${fmtH(wk.avgSleepMin)} across ${wk.nights} logged nights; ${wk.shortNights} short night(s).`,
      suggestion: `Keep your wake time steady and move the target bedtime 15 min earlier (${ctx.settings.targetBedtime} → ${newBed}). Do not wake earlier for sunrise while sleep is short.`,
      rationale: 'Repeated short sleep impairs alertness and health. Shifting bedtime gradually is easier to sustain than a large jump; extra morning light does not replace lost sleep.',
      confidence: conf.c,
      confidenceWhy: conf.why,
      testNext: 'Hold the new bedtime for 5–7 days, then compare average sleep and energy in the Journal trends.',
      priority: 0,
      action: { targetWake: ctx.settings.targetWake, targetBedtime: newBed },
    });
  }

  // 4. Irregular timing.
  if (two.nights >= 5 && two.midpointSd != null && two.midpointSd > 60) {
    const conf = nightsConfidence(two.nights);
    out.push({
      id: 'irregular',
      kind: 'sleep',
      title: 'Make sleep timing more regular',
      observed: `Your sleep midpoint varied by about ±${Math.round(two.midpointSd)} min (SD) over ${two.nights} nights.`,
      suggestion: `Aim to wake within ~30 min of ${ctx.settings.targetWake} every day, including days off, and get daylight soon after waking.`,
      rationale: 'Irregular sleep timing is associated with later circadian timing and poorer daytime functioning; a consistent wake time plus morning light helps anchor the clock.',
      confidence: conf.c,
      confidenceWhy: conf.why,
      testNext: 'Track the "Bedtime irregularity" variable against energy for two weeks.',
      priority: 2,
    });
  }

  // 5. Late screens vs sleep onset / quality.
  const withScreen = ctx.entries.filter((e) => e.lateScreen === 'moderate' || e.lateScreen === 'heavy');
  const lowScreen = ctx.entries.filter((e) => e.lateScreen === 'none' || e.lateScreen === 'brief');
  if (withScreen.length >= 3 && lowScreen.length >= 3) {
    const onsetOf = (es: DailyEntry[]) => mean(es.map((e) => sleepMetrics(e).onset).filter((x): x is number => x != null));
    const qualOf = (es: DailyEntry[]) => mean(es.map((e) => e.sleepQuality).filter((x): x is number => x != null));
    const oHi = onsetOf(withScreen), oLo = onsetOf(lowScreen);
    const qHi = qualOf(withScreen), qLo = qualOf(lowScreen);
    const later = oHi != null && oLo != null ? oHi - oLo : null;
    const worse = qHi != null && qLo != null ? qLo - qHi : null;
    if ((later != null && later >= 20) || (worse != null && worse >= 0.5)) {
      const conf = groupConfidence(withScreen.length, lowScreen.length);
      const bits = [];
      if (later != null && later >= 20) bits.push(`you fell asleep ~${Math.round(later)} min later`);
      if (worse != null && worse >= 0.5) bits.push(`rated sleep ${worse.toFixed(1)} points lower`);
      out.push({
        id: 'late-screens',
        kind: 'pattern',
        title: 'Late screens and your sleep',
        observed: `On nights with moderate/heavy late screen use (${withScreen.length}) vs little/none (${lowScreen.length}), ${bits.join(' and ')}.`,
        suggestion: `Test starting your wind-down ${ctx.settings.windDownMinutes} min before bed with dimmer screens (Night Shift, lower brightness, Reduce White Point) and dimmer room lights.`,
        rationale: 'Bright evening light — screens included — can delay circadian timing and melatonin; content and arousal also matter. Your data show an association, not proof.',
        confidence: conf.c,
        confidenceWhy: conf.why,
        testNext: 'Run a 2-week personal experiment: one week as usual, one with an earlier dim-down; compare sleep onset.',
        priority: 3,
      });
    }
  }

  // 6. Morning outdoor time vs energy.
  const withMorning = ctx.entries.filter((e) => (e.morningOutdoorMin ?? 0) >= 10 && e.energy != null);
  const noMorning = ctx.entries.filter((e) => e.morningOutdoorMin != null && e.morningOutdoorMin < 10 && e.energy != null);
  if (withMorning.length >= 3 && noMorning.length >= 3) {
    const eHi = mean(withMorning.map((e) => e.energy!))!, eLo = mean(noMorning.map((e) => e.energy!))!;
    if (eHi - eLo >= 0.5) {
      const conf = groupConfidence(withMorning.length, noMorning.length);
      out.push({
        id: 'morning-light-energy',
        kind: 'pattern',
        title: 'Morning outdoor time and your energy',
        observed: `Days with ≥10 min outdoors in the morning averaged energy ${eHi.toFixed(1)} vs ${eLo.toFixed(1)} on days without (${withMorning.length} vs ${noMorning.length} days).`,
        suggestion: 'Keep a short outdoor block after waking when practical — no need to look at the Sun, and dress for the weather.',
        rationale: 'Daytime and morning light exposure supports circadian entrainment and alertness. Your own data show an association; days you go out may differ in other ways (weather, schedule).',
        confidence: conf.c,
        confidenceWhy: conf.why,
        testNext: 'Compare "Morning outdoor time" against "Daytime energy" in Trends as more days accumulate.',
        priority: 4,
      });
    }
  }

  // 7. Late caffeine.
  const lateCaf = ctx.entries.filter((e) => {
    const c = parseClock(e.lastCaffeine);
    return c != null && c >= 14 * 60 && e.sleepQuality != null;
  });
  const earlyCaf = ctx.entries.filter((e) => {
    const c = parseClock(e.lastCaffeine);
    return c != null && c < 14 * 60 && e.sleepQuality != null;
  });
  if (lateCaf.length >= 3 && earlyCaf.length >= 3) {
    const d = mean(earlyCaf.map((e) => e.sleepQuality!))! - mean(lateCaf.map((e) => e.sleepQuality!))!;
    if (d >= 0.5) {
      const conf = groupConfidence(lateCaf.length, earlyCaf.length);
      out.push({
        id: 'late-caffeine',
        kind: 'pattern',
        title: 'Afternoon caffeine and sleep quality',
        observed: `Sleep quality averaged ${d.toFixed(1)} points lower after days with caffeine after 14:00 (${lateCaf.length} days).`,
        suggestion: 'Try moving your last caffeine earlier (for example, before early afternoon) for two weeks.',
        rationale: 'Caffeine has a half-life of several hours; a controlled study found caffeine even 6 h before bed reduced sleep (Drake et al., 2013).',
        confidence: conf.c,
        confidenceWhy: conf.why,
        testNext: 'Start an experiment with "sleep quality" as the outcome.',
        priority: 4,
      });
    }
  }

  // 8. Wake time vs sunrise — information, never "wake at sunrise".
  if (ctx.sunriseMin != null) {
    const before = forwardMinutes(targetWake, ctx.sunriseMin);
    if (before > 0 && before < 360 && before >= 45) {
      out.push({
        id: 'dark-mornings',
        kind: 'light',
        title: 'You wake before sunrise',
        observed: `Sunrise today is ~${toClock(ctx.sunriseMin)}, about ${fmtH(before)} after your target wake time (${ctx.settings.targetWake}).`,
        suggestion: 'Keep your wake time if it gives you enough sleep. Use bright indoor light after waking and step outside once it is light, even briefly.',
        rationale: 'A consistent wake time with adequate sleep matters more than matching sunrise. Outdoor daylight, even on cloudy days, is usually far brighter than indoor lighting.',
        confidence: 'moderate',
        confidenceWhy: 'Calculated sunrise; general circadian evidence on light timing, not personalised.',
        testNext: 'Log morning outdoor minutes and compare energy over the next few weeks.',
        priority: 6,
      });
    }
  }

  // 9. Seasonal shift.
  if (ctx.sunriseMin != null && ctx.sunriseIn30Min != null && ctx.daylightTodayMin != null && ctx.daylightIn30Min != null) {
    const shift = ctx.sunriseIn30Min - ctx.sunriseMin;
    const dl = ctx.daylightIn30Min - ctx.daylightTodayMin;
    if (Math.abs(shift) >= 20 || Math.abs(dl) >= 30) {
      out.push({
        id: 'season',
        kind: 'season',
        title: shift > 0 ? 'Mornings are getting darker' : 'Mornings are getting lighter',
        observed: `Over the next 30 days sunrise moves ${Math.abs(Math.round(shift))} min ${shift > 0 ? 'later' : 'earlier'} and day length ${dl >= 0 ? 'grows' : 'shrinks'} by ${Math.abs(Math.round(dl))} min (calculated).`,
        suggestion:
          shift > 0
            ? 'Expect less natural light at your usual wake time; plan outdoor light later in the morning or at midday, and keep your wake time consistent.'
            : 'Natural light will arrive earlier; morning outdoor time becomes easier without changing your wake time.',
        rationale: 'Sunrise and day length change with season and latitude; clock time does not (except at DST changes).',
        confidence: 'higher',
        confidenceWhy: 'Astronomical calculation for your coordinates.',
        testNext: 'Check the Solar Explorer date slider to compare months.',
        priority: 7,
      });
    }
  }

  // 10. Missed planned session.
  const missed = ctx.sessions.filter((s) => s.status === 'planned' && s.end < ctx.now && ctx.now - s.end < 12 * 3600000);
  if (missed.length) {
    out.push({
      id: 'missed-session',
      kind: 'light',
      title: 'A planned outdoor session was missed',
      observed: `${missed.length} planned session(s) earlier today were not marked as done.`,
      suggestion: ctx.nextWindowText
        ? `Next suggested opportunity: ${ctx.nextWindowText}. Mark sessions done in the Exposure Planner if you did go out.`
        : 'No further daylight window today — try tomorrow. Mark sessions done in the Exposure Planner if you did go out.',
      rationale: 'Missing a session is fine; there is no need to "make up" exposure at a higher-UV time.',
      confidence: 'higher',
      confidenceWhy: 'From your own planner entries.',
      testNext: 'Plan shorter, easier sessions if timing is the obstacle.',
      priority: 3,
    });
  }

  // 11. Gradual wake shift toward the target when the user's actual wake is far from it.
  if (wk.nights >= 4 && wk.avgWake != null) {
    const diff = targetWake - wk.avgWake;
    if (Math.abs(diff) >= 45 && (wk.avgSleepMin ?? 0) >= needMin - 30) {
      const step = toClock(gradualStep(wk.avgWake, targetWake, 15));
      out.push({
        id: 'gradual-wake',
        kind: 'sleep',
        title: 'Shift toward your target wake time gradually',
        observed: `You have been waking around ${toClock(wk.avgWake)}, ${Math.abs(Math.round(diff))} min ${diff < 0 ? 'later' : 'earlier'} than your target ${ctx.settings.targetWake}.`,
        suggestion: `Move in 15-min steps every few days (next step: wake ${step}, bedtime shifted equally).`,
        rationale: 'The circadian clock adapts to shifts of roughly an hour or less per day at best; small steps with consistent light timing are easier to maintain.',
        confidence: nightsConfidence(wk.nights).c,
        confidenceWhy: nightsConfidence(wk.nights).why,
        testNext: 'Hold each step 3–4 days and watch sleep duration — if it drops, pause.',
        priority: 3,
      });
    }
  }

  return out
    .filter((r) => !isDismissed(r.id, ctx.decisions, ctx.now))
    .sort((a, b) => a.priority - b.priority);
}
