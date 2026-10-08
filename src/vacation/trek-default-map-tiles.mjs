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
 * Gate B egress blocks `openstreetmap.fr` HOT (0% painted), serves OSMF
 * access-denied tiles from `tile.openstreetmap.org`, and often paints only
 * part of OpenTopo before capture. The German OSM Standard mirror is keyless,
 * colourful, and loads reliably in the Gate B sandbox (zoom 10 + tile kick).
 */
export const TREK_SHARED_DAY_MAP_TILE_URL =
  'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
