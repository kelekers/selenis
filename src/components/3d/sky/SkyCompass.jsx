import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { isValidSkyVector, normalizeAzimuth } from '../../../utils/shadowMath';
import {
  horizontalFovDeg,
  relativeBearingDeg,
  viewHeadingGridDeg,
} from '../../../utils/skyPlacement';

const SIZE = 72;
const C = SIZE / 2;
const R = 27;
const DEG = Math.PI / 180;

// Scratch objects for the per-frame tracker (no allocation in useFrame).
const forward = new THREE.Vector3();
const ndc = new THREE.Vector3();
const camSpace = new THREE.Vector3();

const onRing = (az) => [C + R * Math.sin(az * DEG), C - R * Math.cos(az * DEG)];

function englishBearingHint(onScreen, relativeDeg) {
  if (onScreen) return 'in view';
  if (!Number.isFinite(relativeDeg)) return '—';
  const turn = Math.round(Math.abs(relativeDeg));
  if (turn < 1) return 'above/below';
  return `${turn}° ${relativeDeg > 0 ? 'right' : 'left'}`;
}

/**
 * Interactive circular compass dial for the top-right slot of the Right Sidebar.
 * Rotates live with the 3D camera heading via `apiRef` (updated per frame by `SkyCompassTracker`),
 * displaying North/South needle, camera FOV cone, and live Sun & Earth azimuth markers.
 */
export function HeaderCompassDial({
  apiRef,
  sunLocal,
  earthLocal,
  isSunVisible,
  isDteActive,
  onClick,
  disabled,
}) {
  const rotRef = useRef(null);
  const wedgeRef = useRef(null);

  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      rot: rotRef.current,
      wedge: wedgeRef.current,
      sunHint: null,
      earthHint: null,
      last: {},
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const sun = isValidSkyVector(sunLocal) ? onRing(normalizeAzimuth(sunLocal.azimuth_deg)) : null;
  const earth = isValidSkyVector(earthLocal)
    ? onRing(normalizeAzimuth(earthLocal.azimuth_deg))
    : null;
  const sunFill = isSunVisible === true ? '#f3f4f6' : '#6b7280';
  const earthStroke =
    isDteActive === true ? '#d1d5db' : isDteActive === false ? '#52525b' : '#71717a';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="focus-site-compass-btn"
      aria-label="Interactive 3D Compass — Click to focus active landing site"
      title="3D Compass (rotates with camera heading · click to focus site)"
      className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#15171c] transition hover:bg-[#1e2128] active:scale-95 disabled:opacity-40"
    >
      <svg
        width="44"
        height="44"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Live 3D Sky Compass"
        className="overflow-visible"
      >
        {/* Camera Horizontal FOV Cone */}
        <path ref={wedgeRef} fill="rgba(255, 255, 255, 0.08)" />

        {/* Outer Azimuth Ring */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth="1.2"
        />

        {/* Rotating World Frame (North needle + Cardinal ticks + Sun & Earth dots) */}
        <g ref={rotRef}>
          {/* Cardinal Ticks */}
          <line x1={C} y1={C - R} x2={C} y2={C - R + 4} stroke="#ffffff" strokeWidth="1.8" />
          <line
            x1={C + R}
            y1={C}
            x2={C + R - 3.5}
            y2={C}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1.2"
          />
          <line
            x1={C}
            y1={C + R}
            x2={C}
            y2={C + R - 3.5}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1.2"
          />
          <line
            x1={C - R}
            y1={C}
            x2={C - R + 3.5}
            y2={C}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1.2"
          />

          {/* North Label (Tall Modern White Typography) */}
          <text
            x={C}
            y={C - R - 3}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="800"
            fill="#ffffff"
            transform={`translate(${C}, ${C - R - 3}) scale(0.85, 1.25) translate(${-C}, ${-(C - R - 3)})`}
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            N
          </text>

          {/* Compass Needle: North (crisp silver/white) & South (muted charcoal) */}
          <polygon
            points={`${C},${C - 13} ${C - 4.2},${C} ${C + 4.2},${C}`}
            fill="#e5e7eb"
          />
          <polygon
            points={`${C},${C + 12} ${C - 3.8},${C} ${C + 3.8},${C}`}
            fill="rgba(156, 163, 175, 0.35)"
          />
          <circle cx={C} cy={C} r="2" fill="#ffffff" />

          {/* Earth Position on Ring */}
          {earth && (
            <circle
              data-testid="sky-compass-earth"
              cx={earth[0]}
              cy={earth[1]}
              r="3.4"
              fill="#9ca3af"
              stroke={earthStroke}
              strokeWidth="1.5"
            />
          )}

          {/* Sun Position on Ring */}
          {sun && (
            <circle
              data-testid="sky-compass-sun"
              cx={sun[0]}
              cy={sun[1]}
              r="3.6"
              fill={sunFill}
              stroke="#18181b"
              strokeWidth="1"
            />
          )}
        </g>
      </svg>
    </button>
  );
}

export function SkyCompass({ apiRef, sunLocal, earthLocal, isSunVisible, isDteActive }) {
  const rotRef = useRef(null);
  const wedgeRef = useRef(null);
  const sunHintRef = useRef(null);
  const earthHintRef = useRef(null);
  useEffect(() => {
    apiRef.current = {
      rot: rotRef.current,
      wedge: wedgeRef.current,
      sunHint: sunHintRef.current,
      earthHint: earthHintRef.current,
      last: {},
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const sun = isValidSkyVector(sunLocal) ? onRing(normalizeAzimuth(sunLocal.azimuth_deg)) : null;
  const earth = isValidSkyVector(earthLocal)
    ? onRing(normalizeAzimuth(earthLocal.azimuth_deg))
    : null;
  const sunFill = isSunVisible === true ? '#f59e0b' : '#94a3b8';
  const earthStroke =
    isDteActive === true ? '#10b981' : isDteActive === false ? '#ef4444' : '#94a3b8';

  return (
    <div
      data-testid="sky-compass"
      className="font-jakarta pointer-events-none flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/55 py-1.5 pr-3 pl-1.5 text-[11px] leading-snug text-slate-300 backdrop-blur-md"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Sky compass: Sun and Earth direction relative to camera heading"
      >
        <path ref={wedgeRef} fill="rgba(255,255,255,0.10)" />
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
        <g ref={rotRef}>
          <line x1={C} y1={C - R - 3} x2={C} y2={C - R + 4} stroke="#fbbf24" strokeWidth="1.5" />
          <text x={C} y={C - R - 5} textAnchor="middle" fontSize="8" fill="#fbbf24">
            N
          </text>
          {earth && (
            <circle
              data-testid="sky-compass-earth"
              cx={earth[0]}
              cy={earth[1]}
              r="3.5"
              fill="#1d4ed8"
              stroke={earthStroke}
              strokeWidth="1.8"
            />
          )}
          {sun && (
            <circle
              data-testid="sky-compass-sun"
              cx={sun[0]}
              cy={sun[1]}
              r="3.5"
              fill={sunFill}
              stroke="#fff"
              strokeWidth="0.8"
            />
          )}
        </g>
        <path
          d={`M ${C} ${C - 5} L ${C - 3.5} ${C + 3} L ${C + 3.5} ${C + 3} Z`}
          fill="#e2e8f0"
        />
      </svg>
      <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
        <dt className="text-amber-300">Sun</dt>
        <dd ref={sunHintRef} data-testid="sky-compass-sun-hint" />
        <dt className="text-sky-300">Earth</dt>
        <dd ref={earthHintRef} data-testid="sky-compass-earth-hint" />
      </dl>
    </div>
  );
}

function hintFor(point, localVector, headingLocal, camera) {
  if (!point || !isValidSkyVector(localVector)) return 'unavailable';
  camSpace.set(point[0], point[1], point[2]).applyMatrix4(camera.matrixWorldInverse);
  ndc.set(point[0], point[1], point[2]).project(camera);
  const onScreen = camSpace.z < 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  return englishBearingHint(
    onScreen,
    relativeBearingDeg(normalizeAzimuth(localVector.azimuth_deg), headingLocal)
  );
}

/** Inside the Canvas: rotates the compass to the camera heading and updates the hints. */
export function SkyCompassTracker({
  apiRef,
  northOffset,
  sunPoint,
  earthPoint,
  sunLocal,
  earthLocal,
}) {
  useFrame(({ camera, size }) => {
    const api = apiRef?.current;
    if (!api?.rot) return;
    const { rot, last } = api;
    camera.getWorldDirection(forward);
    const headingGrid = viewHeadingGridDeg([forward.x, forward.y, forward.z]);
    const headingLocal =
      headingGrid === null || !Number.isFinite(northOffset)
        ? null
        : normalizeAzimuth(headingGrid - northOffset);

    const rotAttr =
      headingLocal === null ? '' : `rotate(${(-headingLocal).toFixed(1)} ${C} ${C})`;
    if (last.rot !== rotAttr) {
      rot.setAttribute('transform', rotAttr);
      last.rot = rotAttr;
    }

    const hfov = horizontalFovDeg(camera.fov, size.width / size.height);
    const half = (Math.min(hfov ?? 0, 359) / 2) * DEG;
    const wedgeD = hfov
      ? `M ${C} ${C} L ${(C - R * Math.sin(half)).toFixed(1)} ${(C - R * Math.cos(half)).toFixed(1)} A ${R} ${R} 0 ${hfov > 180 ? 1 : 0} 1 ${(C + R * Math.sin(half)).toFixed(1)} ${(C - R * Math.cos(half)).toFixed(1)} Z`
      : '';
    if (last.wedge !== wedgeD && api.wedge) {
      api.wedge.setAttribute('d', wedgeD);
      last.wedge = wedgeD;
    }

    for (const [key, point, vector] of [
      ['sunHint', sunPoint, sunLocal],
      ['earthHint', earthPoint, earthLocal],
    ]) {
      if (!api[key]) continue;
      const text =
        headingLocal === null ? 'unavailable' : hintFor(point, vector, headingLocal, camera);
      if (last[key] !== text) {
        api[key].textContent = text;
        last[key] = text;
      }
    }
  });
  return null;
}
