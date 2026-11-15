import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { skyTrackSegments } from '../../../utils/skyPlacement';
import { SKY_RENDER_ORDER } from './SkySun';

const TRACKS = [
  { key: 'sun_vector', name: 'sun', color: '#f59e0b' },
  { key: 'earth_vector', name: 'earth', color: '#38bdf8' }, // same blue as the panorama Earth track
];

/**
 * Paths of the Sun and the Earth over the whole mission window for the active site, on the sky
 * dome: solid = already passed (up to the current time), faint dashed = still to come. Both parts
 * meet at the current icon. Gaps in the data break the path (never interpolated across).
 */
export function SkyTracks({ timeline, timeIndex, northOffset, center, radiusKm }) {
  const [cx, cy, cz] = center ?? [];
  const tracks = useMemo(() => {
    const c = [cx, cy, cz];
    return TRACKS.map((t) => ({ ...t, ...skyTrackSegments(timeline, t.key, northOffset, c, radiusKm, timeIndex) }));
  }, [timeline, timeIndex, northOffset, cx, cy, cz, radiusKm]);

  if (!center || !radiusKm) return null;
  return (
    <group name="sky-tracks">
      {tracks.map((t) => [
        ...t.past.map((points, i) => (
          <Line
            key={`${t.name}-past-${i}`}
            name={`sky-track-${t.name}-past-${i}`}
            points={points}
            color={t.color}
            lineWidth={1.6}
            transparent
            opacity={0.85}
            depthTest={false}
            depthWrite={false}
            renderOrder={SKY_RENDER_ORDER - 1}
          />
        )),
        ...t.future.map((points, i) => (
          <Line
            key={`${t.name}-future-${i}`}
            name={`sky-track-${t.name}-future-${i}`}
            points={points}
            color={t.color}
            lineWidth={1}
            dashed
            dashSize={0.12}
            gapSize={0.1}
            transparent
            opacity={0.35}
            depthTest={false}
            depthWrite={false}
            renderOrder={SKY_RENDER_ORDER - 1}
          />
        )),
      ])}
    </group>
  );
}
