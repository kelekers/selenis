import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Detailed, Html, OrbitControls } from '@react-three/drei';
import { buildHemisphereGeometry, hemisphereLodData, hemisphereRegionMarkers, hemisphereSunDirection, MOON_RADIUS_KM } from '../../utils/hemisphereMath';
import { detectWebGL2, maxRenderDpr } from '../../utils/renderQuality';
import { SceneErrorBoundary, SceneFallbackPanel } from './SceneFallback';
import { DebugProbe } from './LunarScene';

function OverviewCamera({ reset, zoomed, regions }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * size.width / size.height);
    const distance = zoomed ? MOON_RADIUS_KM * 1.14
      : MOON_RADIUS_KM * 1.12 / Math.sin(Math.min(vertical, horizontal) / 2);
    const positions = hemisphereRegionMarkers(regions).map((marker) => marker.position);
    const centre = (axis) => positions.length ? (
      Math.min(...positions.map((p) => p[axis])) + Math.max(...positions.map((p) => p[axis]))
    ) / 2 * distance / MOON_RADIUS_KM : 0;
    camera.position.set(zoomed ? centre(0) : 0, distance, zoomed ? centre(2) : distance * 0.0001);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, reset, zoomed, regions, invalidate]);
  return null;
}

export function SouthHemisphereScene({ activeSite, activeEphemeris, regionName, regions, selectedRegionId, onOpenDetail }) {
  const [webgl] = useState(() => detectWebGL2());
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState('');
  const [texture, setTexture] = useState(null);
  const [textureError, setTextureError] = useState(false);
  const [reset, setReset] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const contextCleanup = useRef(null);
  useEffect(() => () => contextCleanup.current?.(), []);
  useEffect(() => {
    const controller = new AbortController();
    let geometries;
    fetch('/data/south_hemisphere.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Dataset hemisfer HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        geometries = [];
        for (const stride of [1, 2, 4]) geometries.push(buildHemisphereGeometry(hemisphereLodData(data, stride)));
        setAsset({ data, geometries });
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => { controller.abort(); geometries?.forEach((geometry) => geometry.dispose()); };
  }, []);
  const textureUrl = asset?.data.albedo_texture;
  useEffect(() => {
    if (!textureUrl || !/^\/textures\/[\w-]+\.webp$/.test(textureUrl)) return undefined;
    let active = true;
    const loaded = new THREE.TextureLoader().load(textureUrl, (value) => {
      if (!active) return;
      value.colorSpace = THREE.SRGBColorSpace;
      setTexture(value);
    }, undefined, () => { if (active) setTextureError(true); });
    return () => { active = false; loaded.dispose(); };
  }, [textureUrl]);
  const sun = hemisphereSunDirection(activeSite, activeEphemeris?.sun_vector);
  const markers = hemisphereRegionMarkers(regions, selectedRegionId, activeSite);

  return (
    <div className="fixed inset-0 h-full w-full bg-[#05070b]" data-testid="hemisphere-scene">
      {!webgl.supported ? <SceneFallbackPanel title="WEBGL 2 TIDAK TERSEDIA" detail={webgl.reason} />
        : error ? <SceneFallbackPanel title="OVERVIEW HEMISFER TIDAK TERSEDIA" detail={error} />
          : !asset ? <p role="status" className="absolute inset-x-0 top-1/2 text-center text-sm text-slate-300">Memuat DEM belahan selatan…</p>
            : <SceneErrorBoundary>
              <Canvas frameloop="demand" dpr={Math.min(1.5, maxRenderDpr(globalThis.window?.devicePixelRatio))}
                camera={{ position: [0, 6500, 1], fov: 42, near: 1, far: 40000 }}
                onCreated={({ gl }) => {
                  contextCleanup.current?.();
                  const lost = () => setContextLost(true);
                  const restored = () => setContextLost(false);
                  gl.domElement.addEventListener('webglcontextlost', lost);
                  gl.domElement.addEventListener('webglcontextrestored', restored);
                  contextCleanup.current = () => {
                    gl.domElement.removeEventListener('webglcontextlost', lost);
                    gl.domElement.removeEventListener('webglcontextrestored', restored);
                  };
                }}>
                <DebugProbe />
                <color attach="background" args={['#05070b']} />
                <ambientLight intensity={0.6} />
                {sun && <directionalLight name="hemisphere-sun" position={sun.map((v) => v * 8000)} intensity={2} />}
                <Detailed name="southern-hemisphere-lod" distances={[0, 3600, 6500]}>
                {asset.geometries.map((geometry, i) => <mesh key={i} name={`southern-hemisphere-terrain-${i}`} geometry={geometry} dispose={null}>
                  <meshStandardMaterial key={texture?.uuid ?? 'untextured'} map={texture} color={texture ? '#ffffff' : '#8d939e'} roughness={1} />
                </mesh>)}
                </Detailed>
                {markers.map((marker, index) => {
                  const x = (index - (markers.length - 1) / 2) * 110;
                  const y = index % 2 ? (zoomed ? -80 : -116) : -64;
                  const color = marker.active ? '#fbbf24' : '#67e8f9';
                  return <group key={marker.id} position={marker.position} name={`region-overview-marker-${marker.id}`}>
                  <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="relative h-0 w-0" style={{ color }}>
                      <svg width="1" height="1" className="pointer-events-none absolute overflow-visible" aria-hidden="true">
                        <line x1="0" y1="0" x2={x} y2={y} stroke="currentColor" strokeWidth="1" />
                      </svg>
                      <span aria-hidden="true" className="absolute -top-1 -left-1 h-2 w-2 rounded-full border border-black"
                        style={{ backgroundColor: color }} />
                      <button type="button" data-region-marker={marker.id}
                        data-testid={marker.active ? 'open-region-detail' : `open-region-detail-${marker.id}`}
                        aria-current={marker.active ? 'location' : undefined}
                        aria-label={`Buka detail ${marker.name}${marker.active ? ', kawasan aktif' : ''}`}
                        title={marker.name} onClick={() => onOpenDetail(marker.id)}
                        style={{ left: x, top: y, transform: 'translate(-50%, -50%)', borderColor: color }}
                        className="pointer-events-auto absolute flex min-h-11 w-24 flex-col items-center justify-center rounded-lg border bg-[#0b101b]/95 px-2 text-xs font-semibold shadow-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {marker.id.replace('SITE', 'Site')}
                        {marker.active && <span className="text-[9px]">Aktif</span>}
                      </button>
                    </div>
                  </Html>
                </group>;
                })}
                <OverviewCamera reset={reset} zoomed={zoomed} regions={regions} />
                <OrbitControls key={reset} makeDefault enablePan={false} minDistance={MOON_RADIUS_KM * 1.1}
                  maxDistance={MOON_RADIUS_KM * 12} minPolarAngle={0.0001} maxPolarAngle={Math.PI / 2 - 0.04} />
              </Canvas>
            </SceneErrorBoundary>}
      <div className="pointer-events-none absolute right-4 bottom-44 z-[6] max-w-[17rem] space-y-2 lg:bottom-28">
        <section data-testid="hemisphere-scope" className="rounded-lg border border-white/15 bg-[#0b101b]/90 p-3 text-[11px] leading-relaxed text-slate-300">
          <h2 className="font-semibold text-slate-100">Seluruh belahan selatan · 0°–90° LS</h2>
          <p>DEM global ~1,9 km · tiga LOD visual, bukan data 5 m.</p>
          {!zoomed && <>
            <p>Analisis A/B dan panorama: {regionName}. Pilih kawasan detail lewat menu lokasi.</p>
            <p>Ketuk label untuk membuka kawasan. Garis menunjuk koordinat asli; penanda diperbesar.</p>
          </>}
          <div className="pointer-events-auto mt-1 flex items-start gap-2">
            <details className="min-w-0 flex-1">
              <summary className="min-h-11 cursor-pointer py-3">Cakupan data</summary>
              <p>LOLA global · grid sumber ~1,9 km arah lintang. Geometri bertingkat dan tekstur 4K; relief 1×. Hemisfer ini bukan DEM 5 m.</p>
              <p>Analisis detail memakai DEM lokal 5 m. Tekstur NASA SVS hanya visual;
                cahaya merupakan pratinjau dari arah Matahari lokasi aktif.</p>
            </details>
            <button type="button" aria-label="Zoom tiga kawasan" disabled={!markers.length}
              onClick={() => { setZoomed(true); setReset((value) => value + 1); }}
              className="min-h-11 rounded border border-white/20 px-2 hover:bg-white/10 disabled:opacity-50">Zoom kutub</button>
            <button type="button" aria-label="Reset hemisfer"
              onClick={() => { setZoomed(false); setReset((value) => value + 1); }}
              className="min-h-11 rounded border border-white/20 px-2 hover:bg-white/10">Reset</button>
          </div>
          {textureError && <p role="status" className="text-amber-200">Tekstur visual gagal dimuat; DEM tetap ditampilkan.</p>}
          {contextLost && <p role="status" className="text-amber-200">Konteks WebGL hilang; menunggu pemulihan.</p>}
        </section>
      </div>
    </div>
  );
}
