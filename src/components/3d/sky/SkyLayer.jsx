import { vectorInGrid } from '../../../utils/sceneFrame';
import { skyPoint } from '../../../utils/skyPlacement';
import { SkyEarth } from './SkyEarth';
import { SkyHorizonRing } from './SkyHorizonRing';
import { SkySun } from './SkySun';
import { SkyTracks } from './SkyTracks';

/**
 * Annotation layer that shows WHERE the Sun and the Earth are for the active site, on a dome of
 * radius `radiusKm` around `center`. Vectors arrive with local azimuths and are rotated into the
 * tile grid with `northOffset` (null = no approved basis → nothing is drawn). Status colours come
 * from `visibility`, the same tri-state flags as the 360° panorama.
 */
export function SkyLayer({
  center,
  radiusKm,
  northOffset,
  ephemerisPoint,
  visibility,
  horizonMask,
  timeline,
  timeIndex,
  mode = 'overview',
  // { icons, tracks, horizon } from the 3D view panel (all on by default).
  layers = { icons: true, tracks: true, horizon: true },
}) {
  if (!center || !radiusKm) return null;
  const sunLocal = ephemerisPoint?.sun_vector;
  const earthLocal = ephemerisPoint?.earth_vector;
  const sunPoint = skyPoint(vectorInGrid(sunLocal, northOffset), center, radiusKm);
  const earthPoint = skyPoint(vectorInGrid(earthLocal, northOffset), center, radiusKm);

  return (
    <group name="sky-layer">
      {layers.horizon && <SkyHorizonRing mask={horizonMask} northOffset={northOffset} center={center} radiusKm={radiusKm} mode={mode} />}
      {layers.tracks && (
        <SkyTracks timeline={timeline} timeIndex={timeIndex} northOffset={northOffset} center={center} radiusKm={radiusKm} />
      )}
      {layers.icons && <SkySun point={sunPoint} vectorLocal={sunLocal} isVisible={visibility?.is_sun_visible} mode={mode} />}
      {layers.icons && (
      <SkyEarth
        point={earthPoint}
        center={center}
        sunPoint={sunPoint}
        vectorLocal={earthLocal}
        sunLocal={sunLocal}
        isVisible={visibility?.is_dte_active}
        mode={mode}
      />
      )}
    </group>
  );
}
