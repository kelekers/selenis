import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { createFallbackHeightmapDataUrl } from '../../mocks/mockDataset';
import {
  decodeHeights,
  filterNoDataTriangles,
  resolveTerrainSource,
  sampleTerrainHeight,
  terrainAssumptions,
} from '../../utils/terrainMath';

const SEGMENTS = 256;
const GRID = SEGMENTS + 1;
// Contract asks for <= 2048²; allow some headroom but refuse absurd images before drawing them.
const MAX_SOURCE_PX = 4096;
// Illustrative defaults used ONLY when metadata lacks them (fixture preview, not NASA values).
const FIXTURE_MIN_ELEV_M = -4200;
const FIXTURE_MAX_ELEV_M = 2150;

/**
 * Resample the image to the GRID×GRID vertex grid. Throws on empty, oversized or CORS-tainted
 * images. `nearest` disables smoothing (required for metric data: interpolation would blend
 * no-data sentinels and neighbouring heights into values that were never measured).
 */
function readGridPixels(img, nearest) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('Gambar heightmap kosong (0 px)');
  if (w > MAX_SOURCE_PX || h > MAX_SOURCE_PX) {
    throw new Error(`Heightmap ${w}×${h} px melebihi batas ${MAX_SOURCE_PX} px`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.imageSmoothingEnabled = !nearest;
  ctx.drawImage(img, 0, 0, GRID, GRID);
  const rgba = ctx.getImageData(0, 0, GRID, GRID).data; // SecurityError if cross-origin without CORS
  return { rgba, size: [w, h] };
}

function buildTerrain(rgba, widthKm, depthKm, decodeOptions) {
  const { heights, noData, noDataCount } = decodeHeights(rgba, GRID, GRID, decodeOptions);

  // PlaneGeometry row 0 = image top row → after rotateX(-90°) lies at -Z (north). See terrainMath.js.
  const geometry = new THREE.PlaneGeometry(widthKm, depthKm, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, noData[i] ? 0 : heights[i]); // no-data vertices are cut out below, never shown
  }
  pos.needsUpdate = true;
  if (noDataCount > 0) {
    geometry.setIndex(filterNoDataTriangles(geometry.index.array, noData));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    noDataCount,
    sampleHeightAtUV: (u, v) => sampleTerrainHeight(heights, GRID, GRID, u, v),
  };
}

/**
 * Renders the terrain mesh. Reports its provenance/loading state through `onStatusChange`
 * ({ state, source, mode, reasons, noDataCount, verticalExaggeration }) so the scene can label it.
 * Real asset failures fall back to the synthetic fixture *visibly* (source: 'fallback').
 */
export function LunarTerrain({ metadata, onSamplerReady, onStatusChange }) {
  const widthKm = metadata?.area_width_km ?? 20;
  const depthKm = metadata?.area_height_km ?? widthKm;
  const declaredMinM = metadata?.min_elevation_m;
  const declaredMaxM = metadata?.max_elevation_m;

  const plan = useMemo(() => resolveTerrainSource(metadata), [metadata]);
  const fixtureUrl = useMemo(() => createFallbackHeightmapDataUrl(256), []);
  const [terrain, setTerrain] = useState(null);

  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const ve = plan.verticalExaggeration;
    onStatusChange?.({ state: 'loading', source: plan.kind === 'fixture' ? 'fixture' : 'asset' });

    const attempt = (url, source, encoding, reasons) => {
      img.onload = () => {
        if (!active) return;
        try {
          const metric = encoding.mode === 'metric-8bit';
          const { rgba, size } = readGridPixels(img, metric);
          // Metric data never borrows the fixture's illustrative range; visual modes may.
          const built = buildTerrain(rgba, widthKm, depthKm, {
            ...encoding,
            minElevM: metric ? declaredMinM : declaredMinM ?? FIXTURE_MIN_ELEV_M,
            maxElevM: metric ? declaredMaxM : declaredMaxM ?? FIXTURE_MAX_ELEV_M,
            verticalExaggeration: ve,
          });
          const shownReasons =
            source === 'asset'
              ? [...reasons, ...terrainAssumptions(metadata, encoding.mode, size)]
              : reasons;
          setTerrain(built);
          onSamplerReady?.(() => built.sampleHeightAtUV);
          onStatusChange?.({
            state: 'ready',
            source,
            mode: encoding.mode,
            reasons: shownReasons,
            noDataCount: built.noDataCount,
            verticalExaggeration: ve,
          });
        } catch (err) {
          fail(source, reasons, err?.message || String(err));
        }
      };
      img.onerror = () => {
        if (!active) return;
        fail(source, reasons, `Gagal memuat ${source === 'asset' ? url : 'heightmap fixture'}`);
      };
      img.src = url;
    };

    const fail = (source, previousReasons, reason) => {
      if (source === 'asset') {
        attempt(fixtureUrl, 'fallback', { mode: 'fixture' }, [reason]);
        return;
      }
      setTerrain(null);
      onSamplerReady?.(null);
      onStatusChange?.({ state: 'error', source, mode: 'fixture', reasons: [...previousReasons, reason] });
    };

    if (plan.kind === 'asset') {
      attempt(plan.url, 'asset', plan.encoding, plan.encoding.reasons);
    } else if (plan.kind === 'blocked-asset') {
      attempt(fixtureUrl, 'fallback', { mode: 'fixture' }, plan.encoding.reasons);
    } else {
      attempt(fixtureUrl, 'fixture', { mode: 'fixture' }, []);
    }

    return () => {
      // Cancel stale loads: a superseded image must never replace newer terrain.
      active = false;
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [plan, metadata, fixtureUrl, widthKm, depthKm, declaredMinM, declaredMaxM, onSamplerReady, onStatusChange]);

  // Sole owner of geometry disposal: release the previous geometry once it is replaced/unmounted.
  useEffect(() => {
    return () => terrain?.geometry.dispose();
  }, [terrain]);

  if (!terrain) return null;

  return (
    <mesh geometry={terrain.geometry} castShadow receiveShadow name="lunar-south-pole-terrain">
      <meshStandardMaterial color="#8d939e" roughness={0.94} metalness={0.04} flatShading={false} />
    </mesh>
  );
}
