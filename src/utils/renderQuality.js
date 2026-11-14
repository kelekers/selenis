/**
 * Render capability + adaptive quality helpers (pure where possible, testable with node --test).
 * three r187 renders with WebGL 2 only, so WebGL 1 support is not enough.
 */

/**
 * Cheap capability check: is the WebGL 2 API exposed at all? Deliberately does NOT create a
 * probe context (that would add a second WebGL context next to R3F's and its creation cost).
 * Real creation failures (blocklisted GPU, disabled 3D APIs) are caught by SceneErrorBoundary.
 * `win` is injectable for tests.
 * @returns {{ supported: boolean, reason: string|null }}
 */
export function detectWebGL2(win = globalThis.window) {
  if (!win?.document?.createElement) return { supported: false, reason: 'Lingkungan tanpa DOM' };
  if (typeof win.WebGL2RenderingContext !== 'function') {
    return {
      supported: false,
      reason: 'Browser ini tidak menyediakan WebGL 2 (dibutuhkan three.js r187)',
    };
  }
  return { supported: true, reason: null };
}

/** Highest DPR we render at: device ratio capped at `cap` (default 2), never below 1. */
export function maxRenderDpr(deviceRatio, cap = 2) {
  const r = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return Math.max(1, Math.min(cap, r));
}

/**
 * Next DPR after a performance signal. dir = -1 (decline) / +1 (incline).
 * Steps of 0.5 within [1, max]; result is rounded to 2 decimals.
 */
export function stepDpr(current, dir, max, step = 0.5) {
  const cur = Number.isFinite(current) ? current : 1;
  const hi = Number.isFinite(max) && max >= 1 ? max : 1;
  const next = Math.max(1, Math.min(hi, cur + Math.sign(dir) * step));
  return Math.round(next * 100) / 100;
}

/** Short Indonesian description of a scene render failure (for the fallback panel). */
export function describeRenderFailure(error) {
  const msg = String(error?.message ?? error ?? '');
  if (/webgl|context/i.test(msg)) {
    return 'Konteks WebGL tidak dapat dibuat oleh browser/GPU.';
  }
  return msg ? `Kesalahan render 3D: ${msg.slice(0, 160)}` : 'Kesalahan render 3D yang tidak diketahui.';
}
