import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MOCK_EPHEMERIS_VECTORS,
  MOCK_SITE_TELEMETRY,
} from '../mocks/mockDataset';
import { evaluateLineOfSight } from '../utils/shadowMath';
import { ephemerisAtIndex } from '../utils/ephemerisMath';
import { clampIndex, resolveActiveSite, resolveCompanionSite } from '../utils/hudModel';
import { hasSiteTimelines, timelineForSite } from '../utils/timeline';
import { DEFAULT_REGION, localRegionsFromCatalog } from '../utils/localRegions';
import { buildCalculatedSite, MAX_SITES, SITE_LETTERS } from '../utils/siteCalculations';

export function useEphemerisData() {
  const [telemetry, setTelemetry] = useState(MOCK_SITE_TELEMETRY);
  const [ephemeris, setEphemeris] = useState(MOCK_EPHEMERIS_VECTORS);
  const baseDataRef = useRef({ telemetry: MOCK_SITE_TELEMETRY, ephemeris: MOCK_EPHEMERIS_VECTORS });
  const [terrainSampler, setTerrainSamplerState] = useState(null);
  const [hasCustomSiteChanges, setHasCustomSiteChanges] = useState(false);

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
    setHasCustomSiteChanges(false);
    setRegionId(next);
  }, [regions, selectedRegionId]);

  useEffect(() => {
    let cancelled = false;
    const fail = (reason) => {
      if (cancelled) return;
      baseDataRef.current = { telemetry: MOCK_SITE_TELEMETRY, ephemeris: MOCK_EPHEMERIS_VECTORS };
      setTelemetry(MOCK_SITE_TELEMETRY);
      setEphemeris(MOCK_EPHEMERIS_VECTORS);
      setSelectedSiteId(MOCK_SITE_TELEMETRY.sites[0].site_id);
      setHasCustomSiteChanges(false);
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
          baseDataRef.current = { telemetry: siteJson, ephemeris: ephJson };
          setTelemetry(siteJson);
          setEphemeris(ephJson);
          setSelectedSiteId(siteJson.sites[0].site_id);
          setTimeIndex((previous) => clampIndex(previous, timelineForSite(ephJson, siteJson.sites[0].site_id).length));
          setHasCustomSiteChanges(false);
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

  const setTerrainSampler = useCallback((sampler) => {
    setTerrainSamplerState(() => sampler);
  }, []);

  // Re-evaluate custom/moved sites if terrainSampler arrives after they were placed
  useEffect(() => {
    if (!terrainSampler) return;
    setTelemetry((prevTelemetry) => {
      if (!prevTelemetry.sites?.some((s) => s.selection_basis === 'USER_CUSTOM_COORDINATES')) {
        return prevTelemetry;
      }
      const nextTimelines = {};
      const nextSites = prevTelemetry.sites.map((site) => {
        if (site.selection_basis !== 'USER_CUSTOM_COORDINATES') return site;
        const { site: recalc, timeline } = buildCalculatedSite({
          siteId: site.site_id,
          name: site.name,
          pairGroup: site.pair_group,
          uv: site.coordinates?.uv,
          latitude_deg: site.coordinates?.latitude_deg,
          longitude_deg: site.coordinates?.longitude_deg,
          telemetry: baseDataRef.current.telemetry ?? prevTelemetry,
          ephemeris: baseDataRef.current.ephemeris,
          terrainSampler,
          existingSite: site,
        });
        nextTimelines[site.site_id] = timeline;
        return recalc;
      });
      setEphemeris((prevEph) => ({
        ...prevEph,
        timelines_by_site: {
          ...(prevEph.timelines_by_site ?? {}),
          ...nextTimelines,
        },
      }));
      return { ...prevTelemetry, sites: nextSites };
    });
  }, [terrainSampler]);

  /**
   * Add a new site (up to MAX_SITES = 4) at custom UV or Lat/Lon coordinates,
   * calculating all terrain, horizon, slope, and topocentric ephemeris metrics.
   */
  const addSite = useCallback(
    (input = {}) => {
      let createdId = null;
      setTelemetry((prevTelemetry) => {
        if ((prevTelemetry.sites?.length ?? 0) >= MAX_SITES) return prevTelemetry;
        const nextIdx = prevTelemetry.sites.length;
        const letter = SITE_LETTERS[nextIdx] ?? String(nextIdx + 1);
        const regionPrefix = prevTelemetry.terrain_metadata?.region_id ?? 'CUSTOM';
        let candidateId = `${regionPrefix}_SITE_${letter}`;
        let suffix = 1;
        while (prevTelemetry.sites.some((s) => s.site_id === candidateId)) {
          suffix += 1;
          candidateId = `${regionPrefix}_SITE_${letter}_${suffix}`;
        }
        createdId = candidateId;
        const regionLabel =
          prevTelemetry.terrain_metadata?.region_name?.split('/')[0]?.trim() || 'Lunar';
        const defaultName = input.name?.trim() || `${regionLabel} Site ${letter}`;

        // Default offset from active/last site if no explicit coordinates were provided
        const lastSite = prevTelemetry.sites[prevTelemetry.sites.length - 1];
        const fallbackUv = {
          u: Math.max(0.08, Math.min(0.92, (lastSite?.coordinates?.uv?.u ?? 0.5) + (nextIdx % 2 === 0 ? -0.045 : 0.045))),
          v: Math.max(0.08, Math.min(0.92, (lastSite?.coordinates?.uv?.v ?? 0.5) + 0.045)),
        };

        const { site, timeline } = buildCalculatedSite({
          siteId: candidateId,
          name: defaultName,
          pairGroup: prevTelemetry.sites[0]?.pair_group ?? 'CUSTOM_DELTA',
          uv: input.uv ?? (Number.isFinite(input.latitude_deg) && Number.isFinite(input.longitude_deg) ? null : fallbackUv),
          latitude_deg: input.latitude_deg,
          longitude_deg: input.longitude_deg,
          telemetry: prevTelemetry,
          ephemeris: baseDataRef.current.ephemeris,
          terrainSampler,
        });

        setEphemeris((prevEph) => ({
          ...prevEph,
          timelines_by_site: {
            ...(prevEph.timelines_by_site ?? {}),
            [candidateId]: timeline,
          },
        }));
        setSelectedSiteId(candidateId);
        setHasCustomSiteChanges(true);

        return {
          ...prevTelemetry,
          sites: [...prevTelemetry.sites, site],
        };
      });
      return createdId;
    },
    [terrainSampler]
  );

  /**
   * Move an existing site to new UV or Lat/Lon coordinates (and optionally update its name),
   * recalculating its elevation, slope, roughness, 360° horizon mask, and ephemeris timeline.
   */
  const moveSite = useCallback(
    (siteId, input = {}) => {
      if (!siteId) return;
      setTelemetry((prevTelemetry) => {
        const target = prevTelemetry.sites.find((s) => s.site_id === siteId);
        if (!target) return prevTelemetry;

        const { site: updatedSite, timeline } = buildCalculatedSite({
          siteId,
          name: input.name?.trim() || target.name,
          pairGroup: target.pair_group,
          uv: input.uv ?? null,
          latitude_deg: input.latitude_deg,
          longitude_deg: input.longitude_deg,
          telemetry: baseDataRef.current.telemetry ?? prevTelemetry,
          ephemeris: baseDataRef.current.ephemeris,
          terrainSampler,
          existingSite: target,
        });

        setEphemeris((prevEph) => ({
          ...prevEph,
          timelines_by_site: {
            ...(prevEph.timelines_by_site ?? {}),
            [siteId]: timeline,
          },
        }));
        setHasCustomSiteChanges(true);

        return {
          ...prevTelemetry,
          sites: prevTelemetry.sites.map((s) => (s.site_id === siteId ? updatedSite : s)),
        };
      });
    },
    [terrainSampler]
  );

  /**
   * Remove a custom added site (keeps at least 2 sites for comparison).
   */
  const removeSite = useCallback(
    (siteId) => {
      setTelemetry((prevTelemetry) => {
        if ((prevTelemetry.sites?.length ?? 0) <= 2) return prevTelemetry;
        const nextSites = prevTelemetry.sites.filter((s) => s.site_id !== siteId);
        if (nextSites.length === prevTelemetry.sites.length) return prevTelemetry;

        setSelectedSiteId((prevSelected) =>
          prevSelected === siteId ? nextSites[0].site_id : prevSelected
        );
        return {
          ...prevTelemetry,
          sites: nextSites,
        };
      });
    },
    []
  );

  /**
   * Reset sites and ephemeris back to the region's original dataset.
   */
  const resetSites = useCallback(() => {
    const base = baseDataRef.current;
    if (!base?.telemetry || !base?.ephemeris) return;
    setTelemetry(base.telemetry);
    setEphemeris(base.ephemeris);
    setSelectedSiteId(base.telemetry.sites[0]?.site_id ?? null);
    setHasCustomSiteChanges(false);
  }, []);

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
    terrainSampler,
    setTerrainSampler,
    addSite,
    moveSite,
    removeSite,
    resetSites,
    hasCustomSiteChanges,
  };
}
