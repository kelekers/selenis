export const DEFAULT_REGION = {
  id: 'SITE01', name: 'Connecting Ridge / Site01',
  telemetry_url: '/data/site_telemetry.json', ephemeris_url: '/data/ephemeris_vectors.json',
};

export function localRegionsFromCatalog(data) {
  if (data?.schema_version !== 1 || !Array.isArray(data.regions) || !data.regions.length) {
    throw new Error('Katalog kawasan tidak sesuai kontrak.');
  }
  const ids = new Set();
  for (const region of data.regions) {
    if (!/^SITE\d+$/.test(region.id) || ids.has(region.id) || typeof region.name !== 'string' || !region.name.trim() ||
        ![region.telemetry_url, region.ephemeris_url].every((url) => /^\/data\/[\w-]+\.json$/.test(url))) {
      throw new Error('ID atau path kawasan tidak valid.');
    }
    ids.add(region.id);
  }
  if (!ids.has(data.default_region_id)) throw new Error('Kawasan default tidak tersedia.');
  return data.regions;
}
