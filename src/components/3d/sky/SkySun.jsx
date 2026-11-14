import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SUN_ANGULAR_DIAMETER_DEG, skyObjectLabel } from '../../../utils/skyPlacement';
import { SkyLabel } from './SkyLabel';

const TEX_PX = 128;
/** Disk diameter / texture width; the rest of the texture is glow. */
const DISK_FRACTION = 0.25;
/** Non-attenuated sprite scale in the overview: disk ≈ 15 px tall on a 900 px viewport (fov 42°). */
const OVERVIEW_SCALE = 0.05;
/** Sky annotations draw after the terrain and markers, without depth test (always visible). */
export const SKY_RENDER_ORDER = 30;

/** Glow texture (white core, warm halo); shared by the local sky icon and the space-view Sun. */
export function createSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_PX;
  canvas.height = TEX_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = TEX_PX / 2;
  const disk = DISK_FRACTION; // disk radius / gradient radius (both relative to half the texture)
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(disk * 0.85, 'rgba(255,244,200,1)');
  g.addColorStop(disk, 'rgba(255,214,120,0.9)');
  g.addColorStop(disk * 1.35, 'rgba(255,190,80,0.35)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_PX, TEX_PX);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Sun icon on the sky dome. Direction is exact (grid-rotated ephemeris vector); size/distance are
 * NOT to scale in the overview. In 'pov' mode the disk has the Sun's real angular diameter.
 * `isVisible` is the same tri-state flag as the panorama: visible = bright, otherwise grey ghost.
 */
export function SkySun({ point, vectorLocal, isVisible, mode = 'overview', showLabel = true }) {
  const texture = useMemo(() => createSunTexture(), []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!point) return null;

  const scale = mode === 'pov' ? ((SUN_ANGULAR_DIAMETER_DEG * Math.PI) / 180) / DISK_FRACTION : OVERVIEW_SCALE;
  const visible = isVisible === true;

  return (
    <group name="sky-sun">
      {texture && (
        <sprite name="sky-sun-sprite" position={point} scale={[scale, scale, 1]} renderOrder={SKY_RENDER_ORDER}>
          <spriteMaterial
            map={texture}
            sizeAttenuation={false}
            depthTest={false}
            depthWrite={false}
            transparent
            color={visible ? '#ffffff' : '#94a3b8'}
            opacity={visible ? 1 : 0.55}
            blending={visible ? THREE.AdditiveBlending : THREE.NormalBlending}
          />
        </sprite>
      )}
      {showLabel && (
        <SkyLabel position={point} tone="sun" testId="sky-sun-label">
          {skyObjectLabel('sun', vectorLocal, isVisible)}
        </SkyLabel>
      )}
    </group>
  );
}
