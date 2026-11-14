import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { createFallbackHeightmapDataUrl } from '../../mocks/mockDataset';

const SEGMENTS = 256;

function buildTerrainFromImage(img, areaWidthKm, areaHeightKm, elevationSpanKm) {
  const sampleCanvas = document.createElement('canvas');
  const grid = SEGMENTS + 1;
  sampleCanvas.width = grid;
  sampleCanvas.height = grid;

  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, grid, grid);
  const pixels = ctx.getImageData(0, 0, grid, grid).data;

  const heights = new Float32Array(grid * grid);
  for (let i = 0; i < grid * grid; i += 1) {
    const normalized = pixels[i * 4] / 255;
    heights[i] = (normalized - 0.5) * elevationSpanKm;
  }

  const geo = new THREE.PlaneGeometry(areaWidthKm, areaHeightKm, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i += 1) {
    posAttr.setY(i, heights[i]);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  const sampleHeightAtUV = (u, v) => {
    const clampedU = Math.max(0, Math.min(1, u));
    const clampedV = Math.max(0, Math.min(1, v));
    const gx = Math.round(clampedU * SEGMENTS);
    const gy = Math.round(clampedV * SEGMENTS);
    return heights[gy * grid + gx] ?? 0;
  };

  return { geometry: geo, sampleHeightAtUV };
}

export function LunarTerrain({ metadata, onSamplerReady }) {
  const areaWidthKm = metadata?.area_width_km ?? 20;
  const areaHeightKm = metadata?.area_height_km ?? 20;
  const minElevM = metadata?.min_elevation_m ?? -4200;
  const maxElevM = metadata?.max_elevation_m ?? 2150;
  const elevationSpanKm = Math.max(0.5, (maxElevM - minElevM) / 1000);

  const [terrainState, setTerrainState] = useState(null);

  const fallbackUrl = useMemo(() => createFallbackHeightmapDataUrl(256), []);
  const textureSource = metadata?.heightmap_texture || fallbackUrl;

  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (!active) return;
      const built = buildTerrainFromImage(
        img,
        areaWidthKm,
        areaHeightKm,
        elevationSpanKm
      );
      setTerrainState((prev) => {
        if (prev?.geometry) prev.geometry.dispose();
        return built;
      });
      if (onSamplerReady) {
        onSamplerReady(() => built.sampleHeightAtUV);
      }
    };

    img.onerror = () => {
      if (!active || textureSource === fallbackUrl) return;
      img.src = fallbackUrl;
    };

    img.src = textureSource;

    return () => {
      active = false;
    };
  }, [textureSource, fallbackUrl, areaWidthKm, areaHeightKm, elevationSpanKm, onSamplerReady]);

  useEffect(() => {
    return () => {
      if (terrainState?.geometry) {
        terrainState.geometry.dispose();
      }
    };
  }, [terrainState]);

  if (!terrainState?.geometry) {
    return null;
  }

  return (
    <mesh
      geometry={terrainState.geometry}
      castShadow
      receiveShadow
      name="lunar-south-pole-terrain"
    >
      <meshStandardMaterial
        color="#8d939e"
        roughness={0.94}
        metalness={0.04}
        flatShading={false}
      />
    </mesh>
  );
}