import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EARTH_ANGULAR_DIAMETER_DEG, earthPhase } from '../../../utils/skyPlacement';
import { isValidSkyVector } from '../../../utils/shadowMath';
import { skyLineStyle } from '../../../utils/markerLayout';
import { SkyLabel } from './SkyLabel';
import { SKY_RENDER_ORDER } from './SkySun';

function englishEarthLabel(vectorLocal, state) {
  if (!isValidSkyVector(vectorLocal)) return 'Earth: direction unavailable';
  return `Earth ${state === true ? 'visible' : state === false ? 'occluded' : 'unknown'}`;
}

const TEX_PX = 128;
const DISK_R_PX = 40;
/** Disk diameter / texture width (the status ring and margin use the rest). */
const DISK_FRACTION = (2 * DISK_R_PX) / TEX_PX;
/** Non-attenuated sprite scale in the overview: disk ≈ 26 px tall on a 900 px viewport (fov 42°). */
const OVERVIEW_SCALE = 0.035;
const DEG = Math.PI / 180;

// Scratch vectors for the per-frame limb orientation (no allocation in useFrame).
const pEarth = new THREE.Vector3();
const pToward = new THREE.Vector3();
const tangent = new THREE.Vector3();

/**
 * Paint the Earth disk with its bright limb toward +x (the sprite is rotated toward the Sun on
 * screen) and flag the texture for upload. phaseAngleDeg = Sun–Earth–observer angle; null = unknown
 * phase (uniform dim disk).
 */
function paintEarth(texture, phaseAngleDeg, ringColor) {
  const canvas = texture.image;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = TEX_PX / 2;
  ctx.clearRect(0, 0, TEX_PX, TEX_PX);
  ctx.beginPath();
  ctx.arc(c, c, DISK_R_PX, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'; // night side
  ctx.fill();

  const day = ctx.createLinearGradient(c - DISK_R_PX, c, c + DISK_R_PX, c);
  day.addColorStop(0, '#1d4ed8');
  day.addColorStop(1, '#bfdbfe');
  ctx.fillStyle = day;
  ctx.beginPath();
  if (Number.isFinite(phaseAngleDeg)) {
    const cosA = Math.cos(phaseAngleDeg * DEG);
    // Right half-disk, then the terminator (half-ellipse) back to the top: through the left side
    // for a gibbous Earth (cosA > 0), through the right side for a crescent.
    ctx.arc(c, c, DISK_R_PX, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(c, c, DISK_R_PX * Math.abs(cosA), DISK_R_PX, 0, Math.PI / 2, -Math.PI / 2, cosA < 0);
  } else {
    ctx.globalAlpha = 0.5;
    ctx.arc(c, c, DISK_R_PX, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(c, c, DISK_R_PX + 7, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = ringColor;
  ctx.stroke();
  texture.needsUpdate = true;
}

/**
 * Earth icon on the sky dome. Direction is exact; size/distance are NOT to scale in the overview
 * ('pov' = real angular diameter ≈ 1.9°). The phase is approximated from the Sun–Earth angle in the
 * data and the bright limb is turned toward the Sun on screen every frame. Ring colour and opacity
 * follow the panorama's Earth flag (line of sight only, not radio-link quality).
 */
export function SkyEarth({ point, center, sunPoint, vectorLocal, sunLocal, isVisible, mode = 'overview', showLabel = true }) {
  const texture = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = TEX_PX;
    cv.height = TEX_PX;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const phase = earthPhase(sunLocal, vectorLocal);
  const phaseKey = phase ? Math.round(phase.phaseAngleDeg * 2) / 2 : null; // repaint per 0.5°
  const ringColor = skyLineStyle('earth', isVisible).color;
  useEffect(() => {
    paintEarth(texture, phaseKey, ringColor);
  }, [texture, phaseKey, ringColor]);

  // Turn the bright limb toward the Sun along the great circle Earth → Sun, as seen on screen.
  const spriteRef = useRef(null);
  useFrame(({ camera, size }) => {
    const sprite = spriteRef.current;
    if (!sprite || !point || !sunPoint || !center) return;
    const e = pEarth.set(point[0] - center[0], point[1] - center[1], point[2] - center[2]).normalize();
    tangent.set(sunPoint[0] - center[0], sunPoint[1] - center[1], sunPoint[2] - center[2]).normalize();
    tangent.addScaledVector(e, -tangent.dot(e));
    if (tangent.lengthSq() < 1e-12) return; // Sun exactly behind/in front of the Earth
    tangent.normalize();
    pEarth.set(...point).project(camera);
    pToward.set(...point).addScaledVector(tangent, 0.05).project(camera);
    const aspect = size.width / size.height;
    sprite.material.rotation = Math.atan2(pToward.y - pEarth.y, (pToward.x - pEarth.x) * aspect);
  });

  if (!point) return null;
  const scale = mode === 'pov' ? (EARTH_ANGULAR_DIAMETER_DEG * DEG) / DISK_FRACTION : OVERVIEW_SCALE;
  const detail = phase ? `${Math.round(phase.illuminatedFraction * 100)}% lit` : undefined;

  return (
    <group name="sky-earth">
      <sprite ref={spriteRef} name="sky-earth-sprite" position={point} scale={[scale, scale, 1]} renderOrder={SKY_RENDER_ORDER}>
        <spriteMaterial
          map={texture}
          sizeAttenuation={false}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={isVisible === true ? 1 : 0.55}
        />
      </sprite>
      {showLabel && (
        <SkyLabel position={point} tone="earth" testId="sky-earth-label" detail={detail}>
          {englishEarthLabel(vectorLocal, isVisible)}
        </SkyLabel>
      )}
    </group>
  );
}
