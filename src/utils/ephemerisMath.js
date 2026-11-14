import { azElToUnitVector, isValidSkyVector, unitVectorToAzEl } from './shadowMath.js';

/**
 * Pure helpers to pick an ephemeris sample for a time, without silently falling back to
 * another sample. Interpolation policy is TBD in docs/data-contract.md, so it is OPT-IN and
 * every result says how it was obtained (status). Nothing here extrapolates.
 */

const ISO_UTC_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?Z$/;

/** Parse a strict ISO-8601 UTC timestamp ending in 'Z'. Returns epoch ms or null. */
export function parseUtcTimestamp(value) {
  if (typeof value !== 'string' || !ISO_UTC_Z.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Describe which parts of an ephemeris sample are usable. */
export function validateEphemerisPoint(point) {
  const reasons = [];
  const timeMs = parseUtcTimestamp(point?.timestamp_utc);
  if (timeMs === null) reasons.push('timestamp_utc hilang/tidak valid');
  const sunValid = isValidSkyVector(point?.sun_vector);
  if (!sunValid) reasons.push('sun_vector hilang/tidak valid');
  const earthValid = isValidSkyVector(point?.earth_vector);
  if (!earthValid) reasons.push('earth_vector hilang/tidak valid');
  return { timeMs, sunValid, earthValid, reasons };
}

/** Sample at an index, or null when the index is out of range (no fallback to index 0). */
export function ephemerisAtIndex(timeline, index) {
  if (!Array.isArray(timeline) || !Number.isInteger(index)) return null;
  if (index < 0 || index >= timeline.length) return null;
  return timeline[index] ?? null;
}

/**
 * Interpolate a sky direction along the great circle between two valid vectors (handles the
 * 359°→1° seam and near-zenith cases). Returns null if either input is invalid.
 */
export function interpolateSkyVector(a, b, t) {
  if (!isValidSkyVector(a) || !isValidSkyVector(b) || !Number.isFinite(t)) return null;
  const va = azElToUnitVector(a.azimuth_deg, a.elevation_deg);
  const vb = azElToUnitVector(b.azimuth_deg, b.elevation_deg);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  let v;
  if (omega < 1e-9) {
    v = va;
  } else if (Math.PI - omega < 1e-9) {
    return null; // antipodal: interpolation path undefined
  } else {
    const s = Math.sin(omega);
    const wa = Math.sin((1 - t) * omega) / s;
    const wb = Math.sin(t * omega) / s;
    v = [wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]];
  }
  return unitVectorToAzEl(v);
}

/**
 * Find the ephemeris state for a UTC timestamp.
 * @returns {{ status: 'exact'|'interpolated'|'between-samples'|'out-of-range'|'invalid-time'|'no-data',
 *             point: object|null, index: number|null }}
 * - Timeline must be sorted ascending by timestamp; invalid samples are skipped.
 * - 'between-samples' (interpolate=false) returns point=null: caller must show "unknown".
 * - Outside [first, last] → 'out-of-range', point=null (no clamping, no extrapolation).
 */
export function ephemerisAtTime(timeline, timestampUtc, { interpolate = false } = {}) {
  const targetMs = parseUtcTimestamp(timestampUtc);
  if (targetMs === null) return { status: 'invalid-time', point: null, index: null };
  const samples = (Array.isArray(timeline) ? timeline : [])
    .map((point, index) => ({ point, index, ms: parseUtcTimestamp(point?.timestamp_utc) }))
    .filter((s) => s.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  if (samples.length === 0) return { status: 'no-data', point: null, index: null };
  if (targetMs < samples[0].ms || targetMs > samples[samples.length - 1].ms) {
    return { status: 'out-of-range', point: null, index: null };
  }
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.ms === targetMs) return { status: 'exact', point: s.point, index: s.index };
    const next = samples[i + 1];
    if (next && targetMs > s.ms && targetMs < next.ms) {
      if (!interpolate) return { status: 'between-samples', point: null, index: null };
      const t = (targetMs - s.ms) / (next.ms - s.ms);
      return {
        status: 'interpolated',
        index: null,
        point: {
          timestamp_utc: timestampUtc,
          sun_vector: interpolateSkyVector(s.point.sun_vector, next.point.sun_vector, t),
          earth_vector: interpolateSkyVector(s.point.earth_vector, next.point.earth_vector, t),
        },
      };
    }
  }
  return { status: 'no-data', point: null, index: null };
}
