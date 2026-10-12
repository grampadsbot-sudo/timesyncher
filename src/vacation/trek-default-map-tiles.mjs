/**
 * Default Leaflet raster template when `settings.map_tile_url` is empty.
 * Carto `light_all` now serves an “API KEY REQUIRED” placeholder without a key.
 *
 * OSM Humanitarian (HOT) — keyless, colorful, `{z}/{x}/{y}` + `{s}` (see M_e / TileLayer).
 * Use with OpenStreetMap attribution on the map.
 */
export const TREK_DEFAULT_MAP_TILE_URL =
  'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';

/** OpenTopo raster host for static day-map tiles (`xa()` img grid). */
export const TREK_STATIC_MAP_TILE_HOST = 'https://a.tile.opentopomap.org';

/** Legacy Leaflet template (keepsake defaults); live day map uses `xa()` static tiles. */
export const TREK_SHARED_DAY_MAP_TILE_URL =
  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
