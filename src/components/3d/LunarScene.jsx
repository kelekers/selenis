import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { LunarTerrain } from './LunarTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';

export function LunarScene({
  telemetry,
  sites,
  selectedSiteId,
  onSelectSite,
  activeEphemeris,
  activeVisibility,
}) {
  const [sampleHeightAtUV, setSampleHeightAtUV] = useState(null);

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

        <SiteMarkers
          sites={sites}
          selectedSiteId={selectedSiteId}
          onSelectSite={onSelectSite}
          sampleHeightAtUV={sampleHeightAtUV}
          earthVector={activeEphemeris?.earth_vector}
          isDteActive={activeVisibility?.is_dte_active}
          planeSize={telemetry?.terrain_metadata?.area_width_km ?? 20}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={3}
          maxDistance={38}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>
    </div>
  );
}