import { useEffect, useMemo, useState } from 'react';
import { LunarTerrain } from './LunarTerrain';
import { contextMetadata, horizonBlockerPositions } from '../../utils/terrainMath';

export function SurroundingTerrain({
  primary,
  sampler,
  onStatus,
  onContextSamplerReady,
  onTerrainClick,
  onTerrainPointerMove,
  onTerrainPointerOut,
}) {
  const [metadata, setMetadata] = useState(null);
  useEffect(() => {
    const url = primary?.context_dataset_url;
    if (!url) return undefined;
    const controller = new AbortController();
    onStatus({ state: 'loading' });
    if (!/^\/data\/[\w-]+\.json$/.test(url)) {
      onStatus({ state: 'error' });
      return undefined;
    }
    fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`Context HTTP ${response.status}`);
      return response.json();
    }).then((data) => {
      if (!controller.signal.aborted) setMetadata(contextMetadata(primary, data));
    }).catch((error) => { if (error.name !== 'AbortError') onStatus({ state: 'error' }); });
    return () => controller.abort();
  }, [primary, onStatus]);
  if (!metadata || !sampler) return null;
  return (
    <LunarTerrain
      metadata={metadata}
      edgeSampler={sampler}
      allowSyntheticFallback={false}
      name="lunar-context-terrain"
      onStatusChange={onStatus}
      onSamplerReady={onContextSamplerReady}
      onTerrainClick={onTerrainClick}
      onTerrainPointerMove={onTerrainPointerMove}
      onTerrainPointerOut={onTerrainPointerOut}
    />
  );
}

export function HorizonBlockers({ site, metadata, sampler }) {
  const positions = useMemo(() => horizonBlockerPositions(site, metadata, sampler), [site, metadata, sampler]);
  if (!positions.length) return null;
  return <points name="horizon-blockers" renderOrder={10}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial size={3} sizeAttenuation={false} color="#fbbf24" depthTest={false} />
  </points>;
}
