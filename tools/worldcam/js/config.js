/* Shared constants, geo maths and the labelled demo dataset. */

export const GLOBE_RADIUS = 1;

/* NASA imagery redistributed with three-globe (public domain).
   Loaded from a CDN so the repository stays free of large binaries.
   If they fail to load, globe.js falls back to a plain shaded sphere. */
export const TEXTURES = {
  day:   'https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg',
  night: 'https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg',
  bump:  'https://unpkg.com/three-globe@2.30.0/example/img/earth-topology.png'
};

export const KEY_STORAGE = 'worldcam.windy.key';
export const WINDY_ENDPOINT = 'https://api.windy.com/webcams/api/v3/webcams';

/* Written by export-cameras.mjs. Its presence is what makes the globe
   show real cameras to every visitor without any key at runtime. */
export const CAMERAS_FILE = './data/cameras.json';

/* Categories are only shown when the loaded data actually uses them. */
export const CATEGORY_LABELS = {
  all: 'All',
  beach: 'Beaches',
  mountain: 'Mountains',
  city: 'Cities',
  traffic: 'Roads',
  airport: 'Airports',
  harbor: 'Ports',
  landscape: 'Nature',
  other: 'Other'
};

/* ---------------------------------------------------------------
   Demo dataset.

   These are NOT cameras. They are placeholder markers at real
   coordinates, used so the globe has something to show before an
   API key is configured. Nothing here claims to be a live feed,
   carries a preview image or links to a camera page, because
   inventing any of those would be worse than showing nothing.
   --------------------------------------------------------------- */
export const DEMO_POINTS = [
  ['Zurich', 'Switzerland', 47.3769, 8.5417, 'city'],
  ['Vaduz', 'Liechtenstein', 47.1410, 9.5209, 'city'],
  ['Chur', 'Switzerland', 46.8508, 9.5320, 'city'],
  ['Zermatt', 'Switzerland', 46.0207, 7.7491, 'mountain'],
  ['Paris', 'France', 48.8566, 2.3522, 'city'],
  ['London', 'United Kingdom', 51.5072, -0.1276, 'city'],
  ['Reykjavik', 'Iceland', 64.1466, -21.9426, 'landscape'],
  ['Tromso', 'Norway', 69.6492, 18.9553, 'landscape'],
  ['Lisbon', 'Portugal', 38.7223, -9.1393, 'city'],
  ['Barcelona', 'Spain', 41.3874, 2.1686, 'beach'],
  ['Rome', 'Italy', 41.9028, 12.4964, 'city'],
  ['Santorini', 'Greece', 36.3932, 25.4615, 'beach'],
  ['Istanbul', 'Turkey', 41.0082, 28.9784, 'harbor'],
  ['Cairo', 'Egypt', 30.0444, 31.2357, 'city'],
  ['Cape Town', 'South Africa', -33.9249, 18.4241, 'harbor'],
  ['Nairobi', 'Kenya', -1.2921, 36.8219, 'landscape'],
  ['Lagos', 'Nigeria', 6.5244, 3.3792, 'city'],
  ['Dubai', 'United Arab Emirates', 25.2048, 55.2708, 'city'],
  ['Mumbai', 'India', 19.0760, 72.8777, 'city'],
  ['Kathmandu', 'Nepal', 27.7172, 85.3240, 'mountain'],
  ['Bangkok', 'Thailand', 13.7563, 100.5018, 'city'],
  ['Singapore', 'Singapore', 1.3521, 103.8198, 'harbor'],
  ['Bali', 'Indonesia', -8.4095, 115.1889, 'beach'],
  ['Hong Kong', 'China', 22.3193, 114.1694, 'harbor'],
  ['Shanghai', 'China', 31.2304, 121.4737, 'city'],
  ['Beijing', 'China', 39.9042, 116.4074, 'city'],
  ['Seoul', 'South Korea', 37.5665, 126.9780, 'city'],
  ['Tokyo', 'Japan', 35.6762, 139.6503, 'city'],
  ['Sapporo', 'Japan', 43.0618, 141.3545, 'mountain'],
  ['Sydney', 'Australia', -33.8688, 151.2093, 'harbor'],
  ['Queenstown', 'New Zealand', -45.0312, 168.6626, 'mountain'],
  ['Honolulu', 'United States', 21.3069, -157.8583, 'beach'],
  ['Anchorage', 'United States', 61.2181, -149.9003, 'landscape'],
  ['San Francisco', 'United States', 37.7749, -122.4194, 'city'],
  ['Las Vegas', 'United States', 36.1699, -115.1398, 'city'],
  ['Denver', 'United States', 39.7392, -104.9903, 'mountain'],
  ['Chicago', 'United States', 41.8781, -87.6298, 'city'],
  ['New York', 'United States', 40.7128, -74.0060, 'city'],
  ['Miami', 'United States', 25.7617, -80.1918, 'beach'],
  ['Toronto', 'Canada', 43.6532, -79.3832, 'city'],
  ['Vancouver', 'Canada', 49.2827, -123.1207, 'harbor'],
  ['Mexico City', 'Mexico', 19.4326, -99.1332, 'city'],
  ['Havana', 'Cuba', 23.1136, -82.3666, 'city'],
  ['Bogota', 'Colombia', 4.7110, -74.0721, 'city'],
  ['Lima', 'Peru', -12.0464, -77.0428, 'city'],
  ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729, 'beach'],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816, 'city'],
  ['Ushuaia', 'Argentina', -54.8019, -68.3030, 'landscape'],
  ['Keflavik', 'Iceland', 63.9850, -22.6056, 'airport'],
  ['Amsterdam', 'Netherlands', 52.3676, 4.9041, 'harbor'],
  ['Berlin', 'Germany', 52.5200, 13.4050, 'city'],
  ['Vienna', 'Austria', 48.2082, 16.3738, 'city'],
  ['Prague', 'Czechia', 50.0755, 14.4378, 'city'],
  ['Stockholm', 'Sweden', 59.3293, 18.0686, 'harbor'],
  ['Helsinki', 'Finland', 60.1699, 24.9384, 'harbor'],
  ['Warsaw', 'Poland', 52.2297, 21.0122, 'city'],
  ['Innsbruck', 'Austria', 47.2692, 11.4041, 'mountain'],
  ['Nice', 'France', 43.7102, 7.2620, 'beach']
].map(([title, country, lat, lon, category], i) => ({
  id: 'demo-' + i,
  title,
  city: title,
  country,
  lat,
  lon,
  category,
  status: null,          // unknown by definition — never claim "active"
  image: null,           // no preview: there is no camera behind this point
  link: null,            // no external page to link to
  demo: true
}));

/* ---------------------------------------------------------------
   Geo helpers
   --------------------------------------------------------------- */

/** Latitude/longitude to a position on a sphere, matching the
 *  equirectangular texture orientation used by the earth material. */
export function latLonToVector3(lat, lon, radius = GLOBE_RADIUS, out) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  if (out) return out.set(x, y, z);
  return new THREE.Vector3(x, y, z);
}

/** Great-circle distance in kilometres. */
export function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Sub-solar point for a given date — the real position of the sun
 *  over the Earth, used to place the day/night terminator. */
export function subsolarPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = (280.459 + 0.98564736 * d) * rad;
  const L = q + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  if (ra < 0) ra += 360;
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = ra - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec / rad, lon };
}

/* Sub-lunar point — where the Moon stands overhead right now.
   Low-precision lunar theory (Meeus, abridged): good to a few tenths of a
   degree, which is far better than this needs. Phase follows from the angle
   between the Moon and the Sun, so the crescent you see is the real one. */
export function sublunarPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const T = d / 36525;

  const L = 218.316 + 13.176396 * d;            // mean longitude
  const M = 134.963 + 13.064993 * d;            // mean anomaly
  const F = 93.272 + 13.229350 * d;             // argument of latitude
  const D = 297.850 + 12.190749 * d;            // mean elongation
  const Ms = 357.529 + 0.98560028 * d;          // sun's mean anomaly

  const lambda = (L
    + 6.289 * Math.sin(M * rad)
    - 1.274 * Math.sin((M - 2 * D) * rad)
    + 0.658 * Math.sin(2 * D * rad)
    + 0.214 * Math.sin(2 * M * rad)
    - 0.186 * Math.sin(Ms * rad)
    - 0.114 * Math.sin(2 * F * rad)) * rad;

  const beta = (5.128 * Math.sin(F * rad)
    + 0.281 * Math.sin((M + F) * rad)
    - 0.278 * Math.sin((F - M) * rad)
    - 0.173 * Math.sin((F - 2 * D) * rad)) * rad;

  const e = (23.439 - 0.0000004 * d) * rad;
  const sinDec = Math.sin(beta) * Math.cos(e) + Math.cos(beta) * Math.sin(e) * Math.sin(lambda);
  const dec = Math.asin(sinDec);
  let ra = Math.atan2(
    Math.sin(lambda) * Math.cos(e) - Math.tan(beta) * Math.sin(e),
    Math.cos(lambda)
  ) / rad;
  if (ra < 0) ra += 360;

  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = ra - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec / rad, lon, T };
}

export function formatCoords(lat, lon) {
  const f = (v, pos, neg) => Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? pos : neg);
  return f(lat, 'N', 'S') + ', ' + f(lon, 'E', 'W');
}
