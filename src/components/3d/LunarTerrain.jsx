import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { createFallbackHeightmapDataUrl } from '../../mocks/mockDataset';
import {
  decodeHeights,
  filterNoDataTriangles,
  resolveTerrainSource,
  sampleTerrainHeight,
  terrainAssumptions,
  contextTerrainIndices,
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
function readGridPixels(img, nearest, grid = GRID) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('Gambar heightmap kosong (0 px)');
  if (w > MAX_SOURCE_PX || h > MAX_SOURCE_PX) {
    throw new Error(`Heightmap ${w}×${h} px melebihi batas ${MAX_SOURCE_PX} px`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = grid;
  canvas.height = grid;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.imageSmoothingEnabled = !nearest;
  ctx.drawImage(img, 0, 0, grid, grid);
  const rgba = ctx.getImageData(0, 0, grid, grid).data; // SecurityError if cross-origin without CORS
  return { rgba, size: [w, h] };
}

function buildTerrain(rgba, widthKm, depthKm, decodeOptions) {
  const grid = Math.sqrt(rgba.length / 4);
  const { heights, noData, noDataCount, referenceM } = decodeHeights(rgba, grid, grid, decodeOptions);
  const ve =
    Number.isFinite(decodeOptions.verticalExaggeration) && decodeOptions.verticalExaggeration > 0
      ? decodeOptions.verticalExaggeration
      : 1;
  const fallbackRefM =
    Number.isFinite(decodeOptions.minElevM) && Number.isFinite(decodeOptions.maxElevM)
      ? (decodeOptions.minElevM + decodeOptions.maxElevM) / 2
      : 0;
  const effectiveRefM = Number.isFinite(referenceM) ? referenceM : fallbackRefM;
  const heightsM = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i += 1) {
    heightsM[i] = noData[i] ? Number.NaN : (heights[i] / ve) * 1000 + effectiveRefM;
  }

  // PlaneGeometry row 0 = image top row → after rotateX(-90°) lies at -Z (north). See terrainMath.js.
  const geometry = new THREE.PlaneGeometry(widthKm, depthKm, grid - 1, grid - 1);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, noData[i] ? 0 : heights[i]); // no-data vertices are cut out below, never shown
    const hole = decodeOptions.contextHole;
    if (hole && decodeOptions.edgeSampler) {
      const x = pos.getX(i), z = pos.getZ(i), hw = hole[0] / 2, hd = hole[1] / 2;
      if ((Math.abs(Math.abs(x) - hw) < 1e-6 && Math.abs(z) <= hd) ||
          (Math.abs(Math.abs(z) - hd) < 1e-6 && Math.abs(x) <= hw)) {
        const edge = decodeOptions.edgeSampler(x / hole[0] + 0.5, z / hole[1] + 0.5);
        if (Number.isFinite(edge)) pos.setY(i, edge);
      }
    }
  }
  pos.needsUpdate = true;
  if (noDataCount > 0) {
    geometry.setIndex(filterNoDataTriangles(geometry.index.array, noData));
  }
  if (decodeOptions.contextHole) geometry.setIndex(contextTerrainIndices(
    geometry.index.array, pos.array, ...decodeOptions.contextHole,
  ));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const sampleHeightAtUV = (u, v) => sampleTerrainHeight(heights, grid, grid, u, v);
  sampleHeightAtUV.heightsM = heightsM;
  sampleHeightAtUV.grid = grid;
  sampleHeightAtUV.gridCols = grid;
  sampleHeightAtUV.gridRows = grid;
  sampleHeightAtUV.referenceM = effectiveRefM;
  sampleHeightAtUV.sampleElevationM = (u, v) => sampleTerrainHeight(heightsM, grid, grid, u, v);

  return {
    geometry,
    noDataCount,
    sampleHeightAtUV,
  };
}

/**
 * Renders the terrain mesh. Reports its provenance/loading state through `onStatusChange`
 * ({ state, source, mode, reasons, noDataCount, verticalExaggeration }) so the scene can label it.
 * Real asset failures fall back to the synthetic fixture *visibly* (source: 'fallback').
 */
export function LunarTerrain({ metadata, onSamplerReady, onStatusChange, colorTextureUrl, onColorStatus,
  edgeSampler, allowSyntheticFallback = true, name = 'lunar-south-pole-terrain',
  onTerrainClick, onTerrainPointerMove, onTerrainPointerOut }) {
  const [colorLayer, setColorLayer] = useState(null);
  useEffect(() => {
    if (!colorTextureUrl || !/^\/textures\/[\w-]+\.webp$/.test(colorTextureUrl)) return undefined;
    let active = true;
    const texture = new THREE.TextureLoader().load(colorTextureUrl, (loaded) => {
      if (!active) return;
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.magFilter = loaded.minFilter = THREE.NearestFilter;
      setColorLayer({ url: colorTextureUrl, texture: loaded });
      onColorStatus?.({ url: colorTextureUrl, state: 'ready' });
    }, undefined, () => {
      if (active) onColorStatus?.({ url: colorTextureUrl, state: 'error' });
    });
    return () => { active = false; texture.dispose(); };
  }, [colorTextureUrl, onColorStatus]);
  const colorMap = colorLayer && colorLayer.url === colorTextureUrl ? colorLayer.texture : null;
  const widthKm = metadata?.area_width_km ?? 20;
  const depthKm = metadata?.area_height_km ?? widthKm;
  const declaredMinM = metadata?.min_elevation_m;
  const declaredMaxM = metadata?.max_elevation_m;

  const plan = useMemo(() => resolveTerrainSource(metadata), [metadata]);
  const fixtureUrl = useMemo(
    () => allowSyntheticFallback ? createFallbackHeightmapDataUrl(256) : null,
    [allowSyntheticFallback],
  );
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
          const metric = encoding.mode === 'metric-8bit' || encoding.mode === 'metric-16bit-rg';
          const segments = metadata?.render_segments ?? SEGMENTS;
          if (!Number.isInteger(segments) || segments < 16 || segments > 1024) throw new Error('Resolusi mesh di luar batas');
          const { rgba, size } = readGridPixels(img, metric, segments + 1);
          // Metric data never borrows the fixture's illustrative range; visual modes may.
          const built = buildTerrain(rgba, widthKm, depthKm, {
            ...encoding,
            minElevM: metric ? declaredMinM : declaredMinM ?? FIXTURE_MIN_ELEV_M,
            maxElevM: metric ? declaredMaxM : declaredMaxM ?? FIXTURE_MAX_ELEV_M,
            verticalExaggeration: ve,
            referenceM: metadata?.reference_elevation_m,
            contextHole: metadata?.context_hole_km,
            edgeSampler,
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
      if (source === 'asset' && allowSyntheticFallback) {
        attempt(fixtureUrl, 'fallback', { mode: 'fixture' }, [reason]);
        return;
      }
      setTerrain(null);
      onSamplerReady?.(null);
      onStatusChange?.({ state: 'error', source, mode: 'fixture', reasons: [...previousReasons, reason] });
    };

    if (plan.kind === 'asset') {
      attempt(plan.url, 'asset', plan.encoding, plan.encoding.reasons);
    } else if (!allowSyntheticFallback) {
      onStatusChange?.({ state: 'error', source: 'asset', reasons: plan.encoding.reasons });
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
  }, [plan, metadata, fixtureUrl, widthKm, depthKm, declaredMinM, declaredMaxM, onSamplerReady, onStatusChange, edgeSampler, allowSyntheticFallback]);

  // Sole owner of geometry disposal: release the previous geometry once it is replaced/unmounted.
  useEffect(() => {
    return () => terrain?.geometry.dispose();
  }, [terrain]);

  if (!terrain || (!allowSyntheticFallback && plan.kind !== 'asset')) return null;

  return (
    <mesh
      geometry={terrain.geometry}
      castShadow
      receiveShadow
      name={name}
      onClick={onTerrainClick}
      onPointerMove={onTerrainPointerMove}
      onPointerOut={onTerrainPointerOut}
    >
      <meshStandardMaterial key={colorMap?.uuid ?? 'relief'} map={colorMap} color={colorMap ? '#ffffff' : '#8d939e'} roughness={0.94} metalness={0.04} flatShading={false} />
    </mesh>
  );
}
