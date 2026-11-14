import { useEffect, useMemo, useState } from 'react';
import { Line } from '@react-three/drei';
import { celestialToCartesian } from '../../utils/shadowMath';
import { uvToWorldXZ } from '../../utils/terrainMath';
import { isClickNotDrag } from '../../utils/hudModel';

// Invisible pick proxy: raycast ignores `visible`, so it is hit-testable without being drawn.
// Larger than the pin so markers are tappable on touch screens.
const PICK_RADIUS = 0.55;

export function SiteMarkers({
  sites,
  selectedSiteId,
  onSelectSite,
  sampleHeightAtUV,
  earthVector,
  isDteActive,
  planeSize = 20,
  planeDepth = planeSize,
}) {
  // Geometric Earth direction only; null when the vector is missing/invalid (no invented angles).
  const earthDirection = useMemo(
    () => celestialToCartesian(earthVector?.azimuth_deg, earthVector?.elevation_deg, 10),
    [earthVector?.azimuth_deg, earthVector?.elevation_deg]
  );
  // isDteActive is tri-state: true/false = Earth centre above/below the horizon-mask preview,
  // null = unknown. It is NOT radio-link quality.
  const beamColor = isDteActive === true ? '#10b981' : isDteActive === false ? '#ef4444' : '#94a3b8';
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
      {sites.map((site) => {
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

        const beamPoints = earthDirection && [
          [0, 0.45, 0],
          [earthDirection[0], earthDirection[1] + 0.45, earthDirection[2]],
        ];

        return (
          <group
            key={site.site_id}
            position={[x, y, z]}
            name={`site-marker-${site.site_id}`}
            onClick={(e) => {
              e.stopPropagation();
              // An orbit drag that ends on a marker must not change the selection.
              if (!isClickNotDrag(e.delta)) return;
              onSelectSite(site.site_id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredId(site.site_id);
            }}
            onPointerOut={() => setHoveredId((prev) => (prev === site.site_id ? null : prev))}
          >
            <mesh position={[0, 0.3, 0]} visible={false}>
              <sphereGeometry args={[PICK_RADIUS, 12, 12]} />
            </mesh>

            {/* Tiang & kepala suar pendarat */}
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.44, 12]} />
              <meshStandardMaterial color={pinColor} emissive={pinColor} emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0, 0.48, 0]}>
              <sphereGeometry args={[isSelected ? 0.16 : 0.11, 16, 16]} />
              <meshStandardMaterial color={pinColor} emissive={pinColor} emissiveIntensity={0.9} />
            </mesh>

            {/* Cincin penanda visual (BUKAN zona aman pendaratan terhitung) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <ringGeometry args={[0.25, 0.34, 32]} />
              <meshBasicMaterial color={pinColor} transparent opacity={isSelected ? 0.9 : 0.45} />
            </mesh>

            {/* Arah geometris ke Bumi (site aktif). Warna = pratinjau horizon mask, bukan kualitas link DTE */}
            {isSelected && beamPoints && (
              <Line
                name="earth-direction"
                points={beamPoints}
                color={beamColor}
                lineWidth={2}
                dashed={isDteActive !== true}
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
