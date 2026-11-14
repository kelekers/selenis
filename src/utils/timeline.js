export function timelineForSite(ephemeris, siteId) {
  return ephemeris.timelines_by_site?.[siteId] ?? ephemeris.timeline ?? [];
}

export function hasSiteTimelines(telemetry, ephemeris) {
  return Boolean(telemetry?.sites?.length) && telemetry.sites.every(
    (site) => ephemeris?.timelines_by_site?.[site.site_id]?.length > 0,
  );
}
