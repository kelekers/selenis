export function timelineForSite(ephemeris, siteId) {
  return ephemeris.timelines_by_site
    ? ephemeris.timelines_by_site[siteId] ?? []
    : ephemeris.timeline ?? [];
}

export function metricsForSite(site) {
  return site ? { ...site.summary_metrics, ...site.terrain_summary_metrics } : null;
}

export function hasSiteTimelines(telemetry, ephemeris) {
  return Boolean(telemetry?.sites?.length) && telemetry.sites.every(
    (site) => ephemeris?.timelines_by_site?.[site.site_id]?.length > 0,
  );
}
