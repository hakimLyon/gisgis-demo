// Calculs de mesure et formats d'affichage en français.
// Les distances suivent la sphère terrestre ; les surfaces utilisent une projection locale,
// précise à mieux que 0,5 % sur quelques kilomètres, ce qui suffit à l'échelle d'un chantier.

const EARTH_RADIUS = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

export function distance(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

export function polygonArea(points) {
  if (points.length < 3) return 0;
  const lat0 = toRad(points.reduce((sum, p) => sum + p[1], 0) / points.length);
  const k = (EARTH_RADIUS * Math.PI) / 180;
  const xy = points.map(([lon, lat]) => [lon * k * Math.cos(lat0), lat * k]);
  let twice = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

export function polygonPerimeter(points) {
  return points.length < 2 ? 0 : pathLength([...points, points[0]]);
}

const formatters = new Map();
export function formatNumber(value, digits = 0) {
  const key = digits;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return formatters.get(key).format(value);
}

export function formatLength(meters) {
  if (meters < 1000) return `${formatNumber(meters, meters < 100 ? 1 : 0)} m`;
  return `${formatNumber(meters / 1000, 2)} km`;
}

export function formatArea(squareMeters) {
  if (squareMeters < 10000) return `${formatNumber(squareMeters)} m²`;
  return `${formatNumber(squareMeters / 10000, 2)} ha`;
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « 2020-10-18 » → « 18 octobre 2020 » (long), « oct. 2020 » (short) ou « 18 oct. 2020 » (day)
export function formatDate(iso, style = 'long') {
  const [year, month, day] = iso.split('-').map(Number);
  if (style === 'short') return `${MONTHS_SHORT[month - 1]} ${year}`;
  if (style === 'day') return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
  return `${day === 1 ? '1er' : day} ${MONTHS_LONG[month - 1]} ${year}`;
}

export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatCoordinates(lng, lat) {
  const fmt = (value, pos, neg) => `${formatNumber(Math.abs(value), 5)}° ${value >= 0 ? pos : neg}`;
  return `${fmt(lat, 'N', 'S')}, ${fmt(lng, 'E', 'O')}`;
}
