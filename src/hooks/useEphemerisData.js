import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MOCK_EPHEMERIS_VECTORS,
  MOCK_SITE_TELEMETRY,
} from '../mocks/mockDataset';
import { evaluateLineOfSight } from '../utils/shadowMath';
import { ephemerisAtIndex } from '../utils/ephemerisMath';
import { clampIndex, resolveActiveSite, resolveCompanionSite } from '../utils/hudModel';
import { hasSiteTimelines, timelineForSite } from '../utils/timeline';
import { DEFAULT_REGION, localRegionsFromCatalog } from '../utils/localRegions';

export function useEphemerisData() {
  const [telemetry, setTelemetry] = useState(MOCK_SITE_TELEMETRY);
  const [ephemeris, setEphemeris] = useState(MOCK_EPHEMERIS_VECTORS);
  const [dataMode, setDataMode] = useState('loading');
  const [regions, setRegions] = useState([DEFAULT_REGION]);
  const [selectedRegionId, setRegionId] = useState(DEFAULT_REGION.id);
  const [regionError, setRegionError] = useState(null);
  const activeRegion = regions.find((region) => region.id === selectedRegionId) ?? DEFAULT_REGION;
  const [selectedSiteId, setSelectedSiteId] = useState(
    MOCK_SITE_TELEMETRY.sites[0].site_id
  );
  const [timeIndex, setTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Why team data could not be used (null = no problem / no manifest at all). The UI keeps the
  // labelled dummy data but must say that loading the team data failed instead of hiding it.
  const [dataError, setDataError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/local_regions.json', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const catalog = await response.json();
        const choices = localRegionsFromCatalog(catalog);
        if (controller.signal.aborted) return;
        setRegions(choices);
        setRegionId((previous) => choices.some((region) => region.id === previous) ? previous : catalog.default_region_id);
      })
      .catch((error) => { if (error.name !== 'AbortError') setRegionError(error.message); });
    return () => controller.abort();
  }, []);

  const selectRegion = useCallback((next) => {
    if (next === selectedRegionId || !regions.some((region) => region.id === next)) return;
    setIsPlaying(false);
    setDataMode('loading');
    setDataError(null);
    setRegionId(next);
  }, [regions, selectedRegionId]);

  useEffect(() => {
    let cancelled = false;
    const fail = (reason) => {
      if (cancelled) return;
      setTelemetry(MOCK_SITE_TELEMETRY);
      setEphemeris(MOCK_EPHEMERIS_VECTORS);
      setSelectedSiteId(MOCK_SITE_TELEMETRY.sites[0].site_id);
      setDataMode('scaffold');
      setDataError(reason);
    };

    async function loadScientificAssets() {
      try {
        const manifestRes = await fetch('/data/manifest.json');
        if (!manifestRes.ok) {
          // No manifest at all is the normal scaffold state; other HTTP errors are reported.
          fail(manifestRes.status === 404 ? null : `manifest HTTP ${manifestRes.status}`);
          return;
        }
        const manifest = await manifestRes.json();

        if (manifest.status !== 'ready') {
          fail(null);
          return;
        }

        const [siteRes, ephRes] = await Promise.all([
          fetch(activeRegion.telemetry_url),
          fetch(activeRegion.ephemeris_url),
        ]);

        if (!siteRes.ok || !ephRes.ok) {
          fail(`site_telemetry HTTP ${siteRes.status}, ephemeris_vectors HTTP ${ephRes.status}`);
          return;
        }
        const [siteJson, ephJson] = await Promise.all([siteRes.json(), ephRes.json()]);

        if (!hasSiteTimelines(siteJson, ephJson) || (siteJson.terrain_metadata?.region_id ?? 'SITE01') !== activeRegion.id) {
          fail('file data tim kosong atau tidak sesuai skema (sites[] / timelines_by_site)');
          return;
        }
        if (!cancelled) {
          setTelemetry(siteJson);
          setEphemeris(ephJson);
          setSelectedSiteId(siteJson.sites[0].site_id);
          setTimeIndex((previous) => clampIndex(previous, timelineForSite(ephJson, siteJson.sites[0].site_id).length));
          setDataMode('ready');
          setDataError(null);
        }
      } catch (err) {
        fail(`data tidak dapat dibaca (${err?.message ?? 'error'})`);
      }
    }

    loadScientificAssets();
    return () => {
      cancelled = true;
    };
  }, [activeRegion]);

  useEffect(() => {
    const timeline = timelineForSite(ephemeris, selectedSiteId);
    if (!isPlaying || !timeline.length) return undefined;

    const timer = window.setInterval(() => {
      setTimeIndex((prev) => (prev + 1) % timeline.length);
    }, 350);

    return () => window.clearInterval(timer);
  }, [isPlaying, ephemeris, selectedSiteId]);

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

  const timeline = timelineForSite(ephemeris, selectedSiteId);
  const totalSteps = timeline.length;
  const activeEphemeris = ephemerisAtIndex(timeline, timeIndex);

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
    regions,
    activeRegion,
    selectedRegionId,
    setSelectedRegionId: selectRegion,
    regionError,
    dataMode,
    dataError,
    telemetry,
    ephemeris: { ...ephemeris, timeline },
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
