/**
 * Default Leaflet raster template when `settings.map_tile_url` is empty.
 * Carto `light_all` now serves an “API KEY REQUIRED” placeholder without a key.
 *
 * OSM Humanitarian (HOT) — keyless, colorful, `{z}/{x}/{y}` + `{s}` (see M_e / TileLayer).
 * Use with OpenStreetMap attribution on the map.
 */
export const TREK_DEFAULT_MAP_TILE_URL =
  'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';

/**
 * Shared trip Day-by-Day Leaflet layer.
 * Gate B serves OSMF access-denied mono tiles from `tile.openstreetmap.org`
 * and `tile.openstreetmap.de` (1 hue bucket, ~95% saturated). HOT on
 * `openstreetmap.fr` does not paint there (0% tiles). OpenTopoMap is reachable
 * and multi-hue when enough raster tiles finish before capture (zoom 8,
 * detectRetina off for Gate B Playwright DPR 2, tile-load kick).
 */
export const TREK_SHARED_DAY_MAP_TILE_URL =
  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
