import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MOCK_EPHEMERIS_VECTORS,
  MOCK_SITE_TELEMETRY,
} from '../mocks/mockDataset';
import { evaluateLineOfSight } from '../utils/shadowMath';
import { ephemerisAtIndex } from '../utils/ephemerisMath';
import { clampIndex, resolveActiveSite, resolveCompanionSite } from '../utils/hudModel';

export function useEphemerisData() {
  const [telemetry, setTelemetry] = useState(MOCK_SITE_TELEMETRY);
  const [ephemeris, setEphemeris] = useState(MOCK_EPHEMERIS_VECTORS);
  const [dataMode, setDataMode] = useState('scaffold');
  const [selectedSiteId, setSelectedSiteId] = useState(
    MOCK_SITE_TELEMETRY.sites[0].site_id
  );
  const [timeIndex, setTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadScientificAssets() {
      try {
        const manifestRes = await fetch('/data/manifest.json');
        if (!manifestRes.ok) return;
        const manifest = await manifestRes.json();

        if (manifest.status !== 'ready') {
          if (!cancelled) setDataMode('scaffold');
          return;
        }

        const [siteRes, ephRes] = await Promise.all([
          fetch('/data/site_telemetry.json'),
          fetch('/data/ephemeris_vectors.json'),
        ]);

        if (siteRes.ok && ephRes.ok) {
          const [siteJson, ephJson] = await Promise.all([
            siteRes.json(),
            ephRes.json(),
          ]);

          if (!cancelled && siteJson?.sites?.length && ephJson?.timeline?.length) {
            setTelemetry(siteJson);
            setEphemeris(ephJson);
            setSelectedSiteId(siteJson.sites[0].site_id);
            setTimeIndex(0);
            setDataMode('ready');
          }
        }
      } catch {
        if (!cancelled) setDataMode('scaffold');
      }
    }

    loadScientificAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || !ephemeris.timeline.length) return undefined;

    const timer = window.setInterval(() => {
      setTimeIndex((prev) => (prev + 1) % ephemeris.timeline.length);
    }, 350);

    return () => window.clearInterval(timer);
  }, [isPlaying, ephemeris.timeline.length]);

  // Single owner of site/time state. Unknown ids / out-of-range indices yield null
  // (UI shows "tidak diketahui") instead of silently showing another site or hour 0.
  const activeSite = useMemo(
    () => resolveActiveSite(telemetry.sites, selectedSiteId),
    [telemetry.sites, selectedSiteId]
  );

  const companionSite = useMemo(
    () => resolveCompanionSite(telemetry.sites, activeSite),
    [telemetry.sites, activeSite]
  );

  const totalSteps = ephemeris.timeline.length;
  const activeEphemeris = ephemerisAtIndex(ephemeris.timeline, timeIndex);

  // Accepts a number from the slider/buttons; always stores a valid index.
  const selectTimeIndex = useCallback(
    (next) => setTimeIndex(clampIndex(next, totalSteps)),
    [totalSteps]
  );

  const activeVisibility = useMemo(
    () => evaluateLineOfSight(activeSite, activeEphemeris),
    [activeSite, activeEphemeris]
  );

  return {
    dataMode,
    telemetry,
    ephemeris,
    sites: telemetry.sites,
    activeSite,
    companionSite,
    selectedSiteId,
    setSelectedSiteId,
    timeIndex,
    setTimeIndex: selectTimeIndex,
    totalSteps,
    activeEphemeris,
    activeVisibility,
    isPlaying,
    setIsPlaying,
  };
}