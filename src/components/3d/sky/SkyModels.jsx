import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';

/**
 * Realistic body models (USDZ: binary USDC + JPEG textures), visual only — see docs/REFERENCES.md:
 *   Earth: https://science.nasa.gov/learn/heat/resource/earth-3d-model/ (credit NASA/JPL-Caltech)
 *   Sun:   https://science.nasa.gov/learn/heat/resource/sun-3d-model/
 */
export const BODY_MODEL_URLS = Object.freeze({
  earth: '/models/Earth_1_12756.usdz',
  sun: '/models/Sun_1_1391000.usdz',
});

/**
 * Clone the cached model and fit it into a unit sphere centred at the origin, so the caller can
 * scale it to the same radius as the procedural body (direction, distance and size unchanged).
 * The loader cache keeps the original: geometries and textures are shared and never disposed
 * here; only materials created for this instance are returned for disposal.
 */
/**
 * Centre and radius of the model's actual vertices. A box-based bounding sphere is √3 too large
 * for a sphere (it encloses the box corners), which would shrink the body by 42 %.
 */
function vertexBounds(root) {
  const center = new THREE.Box3().setFromObject(root, true).getCenter(new THREE.Vector3());
  const v = new THREE.Vector3();
  let radius = 0;
  root.traverse((o) => {
    const pos = o.isMesh ? o.geometry?.attributes?.position : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 1) {
      radius = Math.max(radius, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceTo(center));
    }
  });
  return { center, radius };
}

function prepareModel(source, kind) {
  const root = source.clone(true);
  root.updateMatrixWorld(true);
  const { center, radius } = vertexBounds(root);
  const centred = new THREE.Group();
  centred.add(root);
  centred.position.copy(center).negate();
  const unit = new THREE.Group();
  unit.name = `big-${kind}-model`;
  unit.add(centred);
  unit.scale.setScalar(radius > 0 ? 1 / radius : 1);

  const created = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    // transparent from the start: fading a blocked body only changes `opacity` (no shader rebuild).
    if (kind === 'sun') {
      // The Sun shines by itself: unlit material with the model's own texture, so the scene's
      // directional light does not draw a "night side" on it.
      const basic = new THREE.MeshBasicMaterial({
        map: src?.map ?? src?.emissiveMap ?? null,
        color: 0xffffff,
        toneMapped: false,
        transparent: true,
      });
      created.push(basic);
      o.material = basic;
    } else {
      // The model's material (metalness 0.25, no environment map) renders the dark Blue-Marble
      // texture almost black. Same textures on a matte material, brightened for display only:
      // the light direction — and so the phase — is unchanged.
      const matte = new THREE.MeshStandardMaterial({
        map: src?.map ?? null,
        normalMap: src?.normalMap ?? null,
        metalness: 0,
        roughness: 0.85,
        color: new THREE.Color(1.8, 1.8, 1.8),
        transparent: true,
      });
      if (src?.normalScale) matte.normalScale.copy(src.normalScale);
      created.push(matte);
      o.material = matte;
    }
  });
  return { object: unit, materials: created, dispose: () => created.forEach((m) => m.dispose()) };
}

// Blocked/unknown Sun: grey ghost like the small icon (#94a3b8); the Earth keeps its colours.
const GHOST_SUN_TINT = new THREE.Color('#94a3b8');
const WHITE = new THREE.Color(1, 1, 1);

/** Fade (opacity < 1) or restore this instance's own materials (created in prepareModel). */
function applyBodyOpacity(materials, kind, opacity) {
  for (const m of materials) {
    m.opacity = opacity;
    if (kind === 'sun') m.color.copy(opacity < 1 ? GHOST_SUN_TINT : WHITE);
  }
}

/** Quaternion [x, y, z, w] from three scene axis vectors (model X, Y, Z), or null. */
function quaternionFromBasis(basis) {
  if (!basis) return null;
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...basis[0]),
    new THREE.Vector3(...basis[1]),
    new THREE.Vector3(...basis[2])
  );
  return new THREE.Quaternion().setFromRotationMatrix(m).toArray();
}

/**
 * One body model at the origin of its parent group, scaled to `radius` (scene km). The Earth
 * keeps lit materials, so the scene's Sun light gives the real day/night side. `basis` = the
 * model's X/Y/Z axes in scene coordinates (Earth: from Horizons orientation data); without it the
 * model keeps its default pose (north up, continents illustrative). `opacity` < 1 = faded body
 * (blocked or unknown from the site); the materials are this instance's own, so they may be mutated.
 */
export default function BodyModel({ kind, radius, basis, opacity = 1 }) {
  const source = useLoader(USDLoader, BODY_MODEL_URLS[kind]);
  const { object, materials, dispose } = useMemo(() => prepareModel(source, kind), [source, kind]);
  useEffect(() => dispose, [dispose]);
  useEffect(() => applyBodyOpacity(materials, kind, opacity), [materials, kind, opacity]);
  const quaternion = quaternionFromBasis(basis) ?? [0, 0, 0, 1];
  // The unit-sphere normalisation lives on `object.scale`; the radius goes on a wrapper group.
  return (
    <group scale={radius} quaternion={quaternion} name={`big-${kind}-orientation`}>
      <primitive object={object} />
    </group>
  );
}
