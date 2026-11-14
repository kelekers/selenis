import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { isValidSkyVector, normalizeAzimuth } from '../../../utils/shadowMath';
import {
  bearingHint,
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

/**
 * Sky compass: where the Sun and the Earth are relative to the CURRENT VIEW (heading = up, grey
 * wedge = horizontal field of view), with a hint such as "putar 120° ke kanan" when a body is off
 * screen. Azimuths are local (same as the panorama); colours follow the panorama's flags.
 * The view-dependent parts are written by SkyCompassTracker every frame (no React state): this
 * component hands its DOM nodes to the tracker through `apiRef` (a ref owned by the scene).
 */
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
  const earth = isValidSkyVector(earthLocal) ? onRing(normalizeAzimuth(earthLocal.azimuth_deg)) : null;
  const sunFill = isSunVisible === true ? '#f59e0b' : '#94a3b8';
  const earthStroke = isDteActive === true ? '#10b981' : isDteActive === false ? '#ef4444' : '#94a3b8';

  return (
    <div
      data-testid="sky-compass"
      className="pointer-events-none flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/55 py-1.5 pr-3 pl-1.5 text-[11px] leading-snug text-slate-300 backdrop-blur-md"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Kompas langit: arah Matahari dan Bumi relatif terhadap arah pandang kamera">
        <path ref={wedgeRef} fill="rgba(255,255,255,0.10)" />
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
        <g ref={rotRef}>
          <line x1={C} y1={C - R - 3} x2={C} y2={C - R + 4} stroke="#fbbf24" strokeWidth="1.5" />
          <text x={C} y={C - R - 5} textAnchor="middle" fontSize="8" fill="#fbbf24">U</text>
          {earth && (
            <circle data-testid="sky-compass-earth" cx={earth[0]} cy={earth[1]} r="3.5" fill="#1d4ed8" stroke={earthStroke} strokeWidth="1.8" />
          )}
          {sun && (
            <circle data-testid="sky-compass-sun" cx={sun[0]} cy={sun[1]} r="3.5" fill={sunFill} stroke="#fff" strokeWidth="0.8" />
          )}
        </g>
        {/* Camera at the centre, looking up */}
        <path d={`M ${C} ${C - 5} L ${C - 3.5} ${C + 3} L ${C + 3.5} ${C + 3} Z`} fill="#e2e8f0" />
      </svg>
      <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
        <dt className="text-amber-300">Matahari</dt>
        <dd ref={sunHintRef} data-testid="sky-compass-sun-hint" />
        <dt className="text-sky-300">Bumi</dt>
        <dd ref={earthHintRef} data-testid="sky-compass-earth-hint" />
      </dl>
    </div>
  );
}

function hintFor(point, localVector, headingLocal, camera) {
  if (!point || !isValidSkyVector(localVector)) return 'arah tidak tersedia';
  camSpace.set(point[0], point[1], point[2]).applyMatrix4(camera.matrixWorldInverse);
  ndc.set(point[0], point[1], point[2]).project(camera);
  const onScreen = camSpace.z < 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  return bearingHint(onScreen, relativeBearingDeg(normalizeAzimuth(localVector.azimuth_deg), headingLocal));
}

/** Inside the Canvas: rotates the compass to the camera heading and updates the hints. */
export function SkyCompassTracker({ apiRef, northOffset, sunPoint, earthPoint, sunLocal, earthLocal }) {
  useFrame(({ camera, size }) => {
    const api = apiRef.current;
    if (!api?.rot) return;
    const { rot, last } = api;
    camera.getWorldDirection(forward);
    const headingGrid = viewHeadingGridDeg([forward.x, forward.y, forward.z]);
    const headingLocal =
      headingGrid === null || !Number.isFinite(northOffset) ? null : normalizeAzimuth(headingGrid - northOffset);

    const rotAttr = headingLocal === null ? '' : `rotate(${(-headingLocal).toFixed(1)} ${C} ${C})`;
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
      const text = headingLocal === null ? 'arah tidak tersedia' : hintFor(point, vector, headingLocal, camera);
      if (last[key] !== text && api[key]) {
        api[key].textContent = text;
        last[key] = text;
      }
    }
  });
  return null;
}
