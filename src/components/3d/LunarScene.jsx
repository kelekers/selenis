import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { LunarTerrain } from './LunarTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { uvToTerrainXZ } from '../../utils/shadowMath';

function CameraController({ controlsRef, activeSite, cameraView, sampleHeightAtUV, planeSize }) {
  const isTransitioning = useRef(false);
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredPos = useRef(new THREE.Vector3(0, 13, 17));

  useEffect(() => {
    const uv = activeSite?.coordinates?.uv;
    const [sx, sz] = uvToTerrainXZ(uv, planeSize);
    const sy = sampleHeightAtUV ? sampleHeightAtUV(uv?.u ?? 0.5, uv?.v ?? 0.5) : 0;

    if (cameraView === 'site') {
      desiredTarget.current.set(sx, sy + 0.2, sz);
      desiredPos.current.set(sx + 3.2, sy + 3.6, sz + 4.8);
    } else {
      desiredTarget.current.set(0, 0, 0);
      desiredPos.current.set(0, 13, 17);
    }
    isTransitioning.current = true;
  }, [activeSite, cameraView, sampleHeightAtUV, planeSize]);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioning.current) return;

    const alpha = Math.min(1, delta * 4.5);
    controls.target.lerp(desiredTarget.current, alpha);
    camera.position.lerp(desiredPos.current, alpha);
    controls.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.05 &&
      controls.target.distanceTo(desiredTarget.current) < 0.05
    ) {
      isTransitioning.current = false;
    }
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const stopTransition = () => {
      isTransitioning.current = false;
    };
    controls.addEventListener('start', stopTransition);
    return () => controls.removeEventListener('start', stopTransition);
  }, [controlsRef]);

  return null;
}

export function LunarScene({
  telemetry,
  sites,
  activeSite,
  selectedSiteId,
  onSelectSite,
  activeEphemeris,
  activeVisibility,
  cameraView,
}) {
  const [sampleHeightAtUV, setSampleHeightAtUV] = useState(null);
  const controlsRef = useRef(null);
  const planeSize = telemetry?.terrain_metadata?.area_width_km ?? 20;

  return (
    <div className="fixed inset-0 h-full w-full bg-[#05070b]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 13, 17], fov: 42, near: 0.1, far: 250 }}
      >
        <color attach="background" args={['#05070b']} />
        <Stars radius={90} depth={40} count={2500} factor={3} fade speed={0.4} />

        <SunLighting sunVector={activeEphemeris?.sun_vector} />

        <LunarTerrain
          metadata={telemetry?.terrain_metadata}
          onSamplerReady={setSampleHeightAtUV}
        />

        <CompassRing radius={planeSize * 0.51} />

        <SiteMarkers
          sites={sites}
          selectedSiteId={selectedSiteId}
          onSelectSite={onSelectSite}
          sampleHeightAtUV={sampleHeightAtUV}
          earthVector={activeEphemeris?.earth_vector}
          isDteActive={activeVisibility?.is_dte_active}
          planeSize={planeSize}
        />

        <CameraController
          controlsRef={controlsRef}
          activeSite={activeSite}
          cameraView={cameraView}
          sampleHeightAtUV={sampleHeightAtUV}
          planeSize={planeSize}
        />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={2.2}
          maxDistance={38}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>
    </div>
  );
}