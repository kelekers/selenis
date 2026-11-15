import { evaluateLineOfSight, isValidSkyVector, normalizeAzimuth } from './shadowMath.js';
import { parseUtcTimestamp } from './ephemerisMath.js';

export const SYNODIC_MONTH_DAYS = 29.530589;
export const SYNODIC_MONTH_HOURS = SYNODIC_MONTH_DAYS * 24; // ~708.734 hrs
export const ECLIPSE_YEAR_HOURS = 346.620076 * 24; // ~8318.88 hrs (seasonal sub-solar lat cycle)
export const ANOMALISTIC_MONTH_HOURS = 27.55455 * 24; // ~661.309 hrs (Earth lon libration)
export const DRACONIC_MONTH_HOURS = 27.212221 * 24; // ~653.093 hrs (Earth lat libration)
export const PLANNING_YEARS_SPAN = 100; // 2026 to 2126

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Format an ISO timestamp or ms epoch into "YYYY-MM-DD HH:MM UTC".
 */
export function formatEpochUtc(ms) {
  if (!Number.isFinite(ms)) return null;
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * Project a baseline ephemeris point by `offsetHours` (can be 0 to 876,600+ hours = 100 years)
 * for a given lunar site `{ latitude_deg, longitude_deg }`.
 * When `offsetHours === 0`, returns the exact baseline point unchanged.
 */
export function projectEphemerisAtOffset(baseTimeline, timeIndex, offsetHours = 0, siteCoords = null) {
  if (!Array.isArray(baseTimeline) || baseTimeline.length === 0) return null;
  const n = baseTimeline.length;
  const idx = ((Math.round(timeIndex) % n) + n) % n;
  const baseRow = baseTimeline[idx];
  if (!baseRow) return null;

  const extraHours = Math.round(Number(offsetHours) || 0);
  if (extraHours === 0) return baseRow;

  const baseStartMs = parseUtcTimestamp(baseTimeline[0]?.timestamp_utc);
  const totalElapsedHours = extraHours + idx;
  const targetMs = baseStartMs !== null ? baseStartMs + totalElapsedHours * 3600000 : null;
  const timestamp_utc = targetMs !== null ? new Date(targetMs).toISOString().replace('.000Z', 'Z') : baseRow.timestamp_utc;

  // Map totalElapsedHours onto the synodic phase of the base 720h dataset
  const synodicHours = ((totalElapsedHours % SYNODIC_MONTH_HOURS) + SYNODIC_MONTH_HOURS) % SYNODIC_MONTH_HOURS;
  const synodicIdx = Math.min(n - 1, Math.max(0, Math.round(synodicHours)));
  const phaseRow = baseTimeline[synodicIdx] ?? baseRow;

  // Seasonal sub-solar latitude modulation (+/- 1.5424 deg over the 346.62-day eclipse year)
  const baseSeasonPhase = (synodicIdx / ECLIPSE_YEAR_HOURS) * 2 * Math.PI;
  const targetSeasonPhase = (totalElapsedHours / ECLIPSE_YEAR_HOURS) * 2 * Math.PI;
  const deltaSubSolarLatDeg = 1.5424 * (Math.sin(targetSeasonPhase) - Math.sin(baseSeasonPhase));

  // Synodic fractional azimuth drift between integer index and exact synodic phase
  const deltaSunAzDeg = ((synodicHours - synodicIdx) / SYNODIC_MONTH_HOURS) * 360;

  // Earth libration phase shift between base sample and target epoch
  const baseAnomPhase = (synodicIdx / ANOMALISTIC_MONTH_HOURS) * 2 * Math.PI;
  const targetAnomPhase = (totalElapsedHours / ANOMALISTIC_MONTH_HOURS) * 2 * Math.PI;
  const baseDracPhase = (synodicIdx / DRACONIC_MONTH_HOURS) * 2 * Math.PI;
  const targetDracPhase = (totalElapsedHours / DRACONIC_MONTH_HOURS) * 2 * Math.PI;

  const latFactor = siteCoords?.latitude_deg ? Math.sin(Math.abs(siteCoords.latitude_deg) * DEG_TO_RAD) : 0.999;
  const deltaEarthElDeg = 6.68 * (Math.sin(targetDracPhase) - Math.sin(baseDracPhase)) * 0.35 * latFactor;
  const deltaEarthAzDeg = 7.9 * (Math.sin(targetAnomPhase) - Math.sin(baseAnomPhase)) * 0.45;

  const sunVec = isValidSkyVector(phaseRow.sun_vector)
    ? {
        ...phaseRow.sun_vector,
        azimuth_deg: normalizeAzimuth(phaseRow.sun_vector.azimuth_deg + deltaSunAzDeg),
        elevation_deg: Number(
          Math.max(-90, Math.min(90, phaseRow.sun_vector.elevation_deg + deltaSubSolarLatDeg * 0.65)).toFixed(4)
        ),
      }
    : phaseRow.sun_vector;

  const earthVec = isValidSkyVector(phaseRow.earth_vector)
    ? {
        ...phaseRow.earth_vector,
        azimuth_deg: normalizeAzimuth(phaseRow.earth_vector.azimuth_deg + deltaEarthAzDeg),
        elevation_deg: Number(
          Math.max(-90, Math.min(90, phaseRow.earth_vector.elevation_deg + deltaEarthElDeg)).toFixed(4)
        ),
        sub_obs_lon_deg: Number.isFinite(phaseRow.earth_vector.sub_obs_lon_deg)
          ? ((((phaseRow.earth_vector.sub_obs_lon_deg - extraHours * 14.492) + 180) % 360 + 360) % 360) - 180
          : phaseRow.earth_vector.sub_obs_lon_deg,
      }
    : phaseRow.earth_vector;

  return {
    ...phaseRow,
    timestamp_utc,
    sun_vector: sunVec,
    earth_vector: earthVec,
  };
}

/**
 * Analyze a 720-hour lunar cycle at a given `epochOffsetHours` for `site` to find:
 * 1. Best Continuous Sunlight Window
 * 2. Best Simultaneous Sun + Earth DTE Window
 * 3. Peak Optimal Hour (`bestHourIndex`) to jump to
 */
export function findBestMissionWindows(site, baseTimeline, epochOffsetHours = 0) {
  if (!site || !Array.isArray(baseTimeline) || baseTimeline.length === 0) {
    return null;
  }

  const n = baseTimeline.length;
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    const point = projectEphemerisAtOffset(baseTimeline, i, epochOffsetHours, site.coordinates);
    const vis = evaluateLineOfSight(site, point);
    const sunClear = vis?.is_sun_visible === true;
    const earthClear = vis?.is_dte_active === true;
    const sunMargin =
      Number.isFinite(point?.sun_vector?.elevation_deg) && Number.isFinite(vis?.sun_horizon_deg)
        ? point.sun_vector.elevation_deg - vis.sun_horizon_deg
        : 0;
    samples.push({
      index: i,
      timestamp_utc: point?.timestamp_utc,
      sunClear,
      earthClear,
      bothClear: sunClear && earthClear,
      sunEl: point?.sun_vector?.elevation_deg ?? 0,
      sunMargin,
    });
  }

  // Helper to find longest contiguous run matching predicate
  function longestRun(predicate) {
    let bestStart = 0;
    let bestLen = 0;
    let curStart = 0;
    let curLen = 0;

    for (let i = 0; i < n; i += 1) {
      if (predicate(samples[i])) {
        if (curLen === 0) curStart = i;
        curLen += 1;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curLen = 0;
      }
    }
    const endIdx = bestLen > 0 ? Math.min(n - 1, bestStart + bestLen - 1) : 0;
    // Find peak sun elevation inside this run
    let peakIdx = bestStart;
    let maxEl = -999;
    for (let k = bestStart; k <= endIdx; k += 1) {
      if (samples[k].sunEl > maxEl) {
        maxEl = samples[k].sunEl;
        peakIdx = k;
      }
    }
    return {
      startIndex: bestStart,
      endIndex: endIdx,
      peakIndex: peakIdx,
      hours: bestLen,
      days: Number((bestLen / 24).toFixed(1)),
      startUtc: formatEpochUtc(parseUtcTimestamp(samples[bestStart]?.timestamp_utc)),
      endUtc: formatEpochUtc(parseUtcTimestamp(samples[endIdx]?.timestamp_utc)),
      peakUtc: formatEpochUtc(parseUtcTimestamp(samples[peakIdx]?.timestamp_utc)),
      peakSunEl: maxEl > -900 ? Number(maxEl.toFixed(2)) : null,
    };
  }

  const bestSunWindow = longestRun((s) => s.sunClear);
  const bestCombinedWindow = longestRun((s) => s.bothClear);
  const totalSunHours = samples.filter((s) => s.sunClear).length;
  const totalBothHours = samples.filter((s) => s.bothClear).length;

  // Recommended landing index: early-to-peak inside the best combined window (or best sun window if DTE is 0)
  const recommendedWindow = bestCombinedWindow.hours > 0 ? bestCombinedWindow : bestSunWindow;
  const recommendedIndex = recommendedWindow.peakIndex;

  return {
    bestSunWindow,
    bestCombinedWindow,
    recommendedIndex,
    recommendedUtc: recommendedWindow.peakUtc,
    solarAvailabilityPct: Number(((totalSunHours / n) * 100).toFixed(1)),
    combinedAvailabilityPct: Number(((totalBothHours / n) * 100).toFixed(1)),
  };
}
