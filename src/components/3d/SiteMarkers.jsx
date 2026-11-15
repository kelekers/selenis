import { useEffect, useMemo, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { celestialToCartesian } from '../../utils/shadowMath';
import { uvToWorldXZ } from '../../utils/terrainMath';
import { isClickNotDrag } from '../../utils/hudModel';
import { MARKER_DIMENSIONS_KM as DIM, markerScale, skyLineStyle } from '../../utils/markerLayout';
import { SITE_LETTERS } from '../../utils/siteCalculations';

// Default length (scene km) of the Sun/Earth direction lines drawn from the active marker.
const DEFAULT_SKY_LINE_LENGTH_KM = 10;

/** Line from the marker head along a (grid-rotated) sky direction, or null when the vector is invalid. */
function useSkyLine(vector, headHeight, lengthKm) {
  const direction = useMemo(
    () => celestialToCartesian(vector?.azimuth_deg, vector?.elevation_deg, lengthKm),
    [vector?.azimuth_deg, vector?.elevation_deg, lengthKm]
  );
  return useMemo(
    () =>
      direction && [
        [0, headHeight, 0],
        [direction[0], direction[1] + headHeight, direction[2]],
      ],
    [direction, headHeight]
  );
}

export function SiteMarkers({
  sites,
  selectedSiteId,
  onSelectSite,
  sampleHeightAtUV,
  sunVector,
  isSunVisible,
  earthVector,
  isDteActive,
  planeSize = 20,
  planeDepth = planeSize,
  // Line lengths = distance of the matching sky object (small icon on the dome or big body), so
  // each line ends exactly at it. Switches come from the sky panel (big mode: Earth line only).
  sunLineLengthKm = DEFAULT_SKY_LINE_LENGTH_KM,
  earthLineLengthKm = DEFAULT_SKY_LINE_LENGTH_KM,
  showSunLine = true,
  showEarthLine = true,
  placementMode = false,
  uiMode = 'planner',
}) {
  // Sites can be only ~500 m apart: shrink every marker uniformly so pick proxies never overlap.
  const scale = useMemo(() => markerScale(sites, planeSize, planeDepth), [sites, planeSize, planeDepth]);
  const headHeight = DIM.headHeight * scale;
  // Geometric directions only; null when a vector is missing/invalid (no invented angles).
  const sunLine = useSkyLine(sunVector, headHeight, sunLineLengthKm);
  const earthLine = useSkyLine(earthVector, headHeight, earthLineLengthKm);
  // Same tri-state flags as the 360° panorama (team per-site data when available). Earth = line of
  // sight only, NOT radio-link quality.
  const sunStyle = skyLineStyle('sun', isSunVisible);
  const earthStyle = skyLineStyle('earth', isDteActive);
  const [hoveredId, setHoveredId] = useState(null);

  // Pointer cursor feedback; always restored (also on unmount).
  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredId]);

  return (
    <group name="landing-site-markers">
      {sites.map((site, siteIdx) => {
        const isSelected = site.site_id === selectedSiteId;
        const isHovered = site.site_id === hoveredId;
        const uv = site.coordinates?.uv;
        const xz = uvToWorldXZ(uv, planeSize, planeDepth);
        // Never place a marker at a guessed position: skip sites without valid contract UV.
        if (!xz) return null;
        const [x, z] = xz;
        // null = sampler not ready or no-data cell under the site → datum plane (y = 0).
        const y = sampleHeightAtUV?.(uv.u, uv.v) ?? 0;
        const pinColor = isSelected ? '#f59e0b' : isHovered ? '#7dd3fc' : '#38bdf8';
        const siteLetter = SITE_LETTERS[siteIdx] ?? String(siteIdx + 1);

        return (
          <group
            key={site.site_id}
            position={[x, y, z]}
            name={`site-marker-${site.site_id}`}
            onClick={
              placementMode
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    // An orbit drag that ends on a marker must not change the selection.
                    if (!isClickNotDrag(e.delta)) return;
                    onSelectSite(site.site_id);
                  }
            }
            onPointerOver={
              placementMode
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    setHoveredId(site.site_id);
                  }
            }
            onPointerOut={
              placementMode
                ? undefined
                : () => setHoveredId((prev) => (prev === site.site_id ? null : prev))
            }
          >
            <group name="site-marker-body" scale={scale}>
              {/* Invisible pick proxy: raycast ignores `visible`, so it is hit-testable without being drawn. */}
              {!placementMode && (
                <mesh position={[0, DIM.pickCenterHeight, 0]} visible={false}>
                  <sphereGeometry args={[DIM.pickRadius, 12, 12]} />
                </mesh>
              )}

              {/* Tiang & kepala suar pendarat */}
              <mesh position={[0, DIM.pinHeight / 2, 0]}>
                <cylinderGeometry args={[DIM.pinRadius, DIM.pinRadius, DIM.pinHeight, 12]} />
                <meshStandardMaterial color={pinColor} emissive={pinColor} emissiveIntensity={0.6} />
              </mesh>
              <mesh position={[0, DIM.headHeight, 0]}>
                <sphereGeometry args={[isSelected ? DIM.headRadiusSelected : DIM.headRadius, 16, 16]} />
                <meshStandardMaterial color={pinColor} emissive={pinColor} emissiveIntensity={0.9} />
              </mesh>

              {/* Cincin penanda visual (BUKAN zona aman pendaratan terhitung) */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <ringGeometry args={[DIM.ringInner, DIM.ringOuter, 32]} />
                <meshBasicMaterial color={pinColor} transparent opacity={isSelected ? 0.9 : 0.45} />
              </mesh>
            </group>

            {/* Minimal Modern White Letter Marker (A, B, C, D only) */}
            <Html
              position={[0, headHeight + 0.14 * scale, 0]}
              center
              zIndexRange={[6, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                data-testid={`site-3d-label-${site.site_id}`}
                className="font-jakarta pointer-events-none flex flex-col items-center select-none"
              >
                <span
                  className="inline-block origin-bottom scale-y-115 text-[16px] leading-none font-extrabold tracking-wide text-white"
                  style={{
                    textShadow: '0 2px 10px rgba(0,0,0,0.98), 0 0 14px rgba(0,0,0,0.9)',
                  }}
                >
                  {siteLetter}
                </span>
              </div>
            </Html>

            {/* Arah geometris ke Matahari (site aktif). Warna = status yang sama dengan panorama 360°. */}
            {isSelected && showSunLine && sunLine && (
              <Line
                name="sun-direction"
                points={sunLine}
                color={sunStyle.color}
                lineWidth={2}
                dashed={sunStyle.dashed}
                dashSize={0.35}
                gapSize={0.2}
              />
            )}

            {/* Arah geometris ke Bumi (site aktif). Warna = garis pandang, bukan kualitas link DTE. */}
            {isSelected && showEarthLine && earthLine && (
              <Line
                name="earth-direction"
                points={earthLine}
                color={earthStyle.color}
                lineWidth={2}
                dashed={earthStyle.dashed}
                dashSize={0.35}
                gapSize={0.2}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
