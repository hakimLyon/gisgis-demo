import {
  PROJECTS, HOME, CATEGORIES, SOURCES, ATTRIBUTION,
  WAYBACK_TILES, LATEST_RELEASE, DEM_TILES, OPENFREEMAP_TILES, OPENFREEMAP_GLYPHS,
} from './projects.js';
import {
  distance, pathLength, polygonArea, polygonPerimeter,
  formatLength, formatArea, formatNumber, formatDate, todayIso, formatCoordinates,
} from './geo.js';

const maplibregl = window.maplibregl;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EMPTY = { type: 'FeatureCollection', features: [] };
const NOTES_KEY = 'gisgis-demo-notes-v1';
const BUILDING_COLOR = '#eee7d6';
const EXPOSED_COLOR = '#e4553f';
const PLAN_COLOR = '#16c4d2';
const MEASURE_COLOR = '#f2c12e';
const INK = '#10282c';
const EXAGGERATION = 2;
const MAP_LOCALE = {
  'NavigationControl.ZoomIn': 'Zoom avant',
  'NavigationControl.ZoomOut': 'Zoom arrière',
  'NavigationControl.ResetBearing': 'Réorienter vers le nord',
  'AttributionControl.ToggleAttribution': 'Afficher les sources',
};

const app = $('#app');

const state = {
  project: null,
  date: null,
  compareDate: null,
  tool: 'pan',
  compare: false,
  view3d: false,
  flood: false,
  floodLevel: null,
  layers: {},
  droneOpacity: 1,
  measure: { points: [], cursor: null, done: false },
  userNotes: readUserNotes(),
  swipeX: 0.5,
  tab: 'layers',
  cache: new Map(),
  overlay: { study: EMPTY, footprint: EMPTY, plan: EMPTY },
  buildingElevations: [],
  hypsometry: null,
  restoring: false,
  ready: false,
  buildingsAuto: false,
  openToken: 0,
};

/* ------------------------------------------------------------------ stockage des notes */

function readUserNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
  } catch {
    return {};
  }
}

function writeUserNotes() {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(state.userNotes));
  } catch {
    // Stockage indisponible (navigation privée) : les notes restent en mémoire pour la session.
  }
}

/* ------------------------------------------------------------------ style de la carte */

function demSource() {
  return { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: ATTRIBUTION.dem };
}

function floodRamp(level) {
  return ['interpolate', ['linear'], ['elevation'],
    -20, 'rgba(14, 58, 130, 0.9)',
    level - 4, 'rgba(22, 82, 168, 0.82)',
    level - 0.05, 'rgba(64, 146, 232, 0.6)',
    level, 'rgba(64, 146, 232, 0)',
    1000, 'rgba(64, 146, 232, 0)'];
}

function projectsGeojson() {
  return {
    type: 'FeatureCollection',
    features: PROJECTS.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, subtitle: p.subtitle },
      geometry: { type: 'Point', coordinates: p.marker },
    })),
  };
}

const textHalo = { 'text-color': '#ffffff', 'text-halo-color': 'rgba(16, 40, 44, 0.9)', 'text-halo-width': 1.6 };
const nameField = ['coalesce', ['get', 'name:fr'], ['get', 'name']];

function createStyle() {
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      empty: { type: 'geojson', data: EMPTY },
      osm: { type: 'vector', url: OPENFREEMAP_TILES, attribution: ATTRIBUTION.osm },
      'dem-terrain': demSource(),
      'dem-relief': demSource(),
      study: { type: 'geojson', data: EMPTY },
      plan: { type: 'geojson', data: EMPTY },
      footprint: { type: 'geojson', data: EMPTY },
      buildings: { type: 'geojson', data: EMPTY },
      measure: { type: 'geojson', data: EMPTY },
      notes: { type: 'geojson', data: EMPTY },
      projects: { type: 'geojson', data: projectsGeojson() },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1f2d2c' } },
      // Repères d'insertion : les images satellite puis les orthophotos drone viennent se placer dessous.
      { id: 'anchor-imagery', type: 'line', source: 'empty' },
      { id: 'anchor-drone', type: 'line', source: 'empty' },
      {
        id: 'flood', type: 'color-relief', source: 'dem-relief', layout: { visibility: 'none' },
        paint: { 'color-relief-color': floodRamp(8), 'color-relief-opacity': 0.85 },
      },
      {
        id: 'study-line', type: 'line', source: 'study', layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
      },
      {
        id: 'buildings', type: 'fill-extrusion', source: 'buildings', layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': BUILDING_COLOR, 'fill-extrusion-height': 0.4, 'fill-extrusion-opacity': 0.92 },
      },
      {
        id: 'footprint-fill', type: 'fill', source: 'footprint', layout: { visibility: 'none' },
        paint: { 'fill-color': PLAN_COLOR, 'fill-opacity': 0.1 },
      },
      {
        id: 'footprint-line', type: 'line', source: 'footprint', layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': PLAN_COLOR, 'line-width': 3 },
      },
      {
        id: 'plan-existing', type: 'line', source: 'plan',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'kind'], 'existant']],
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'plan-fill', type: 'fill', source: 'plan',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'existant']],
        layout: { visibility: 'none' }, paint: { 'fill-color': PLAN_COLOR, 'fill-opacity': 0.24 },
      },
      {
        id: 'plan-outline', type: 'line', source: 'plan',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'existant']],
        layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': PLAN_COLOR, 'line-width': 2.5 },
      },
      {
        id: 'plan-pipe-casing', type: 'line', source: 'plan', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': INK, 'line-width': 8, 'line-opacity': 0.55 },
      },
      {
        id: 'plan-pipe', type: 'line', source: 'plan', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': PLAN_COLOR, 'line-width': 4 },
      },
      {
        id: 'plan-point', type: 'circle', source: 'plan',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'label']],
        layout: { visibility: 'none' },
        paint: { 'circle-radius': 7, 'circle-color': PLAN_COLOR, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
      },
      {
        id: 'labels-roads', type: 'symbol', source: 'osm', 'source-layer': 'transportation_name', minzoom: 15,
        layout: {
          'symbol-placement': 'line', 'text-field': nameField, 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 13], 'symbol-spacing': 320,
        },
        paint: { ...textHalo, 'text-halo-width': 1.3 },
      },
      {
        id: 'labels-places', type: 'symbol', source: 'osm', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood', 'hamlet']]],
        layout: {
          'text-field': nameField, 'text-font': ['Noto Sans Bold'], 'text-max-width': 8,
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11.5, 16, 15],
        },
        paint: { ...textHalo, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 17, 0.6] },
      },
      {
        id: 'plan-label', type: 'symbol', source: 'plan', filter: ['==', ['get', 'kind'], 'label'],
        layout: {
          visibility: 'none', 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 13,
          'text-max-width': 10, 'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(9, 92, 104, 0.95)', 'text-halo-width': 1.8 },
      },
      {
        id: 'footprint-label', type: 'symbol', source: 'footprint',
        layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 14 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(9, 92, 104, 0.95)', 'text-halo-width': 1.8 },
      },
      {
        id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': MEASURE_COLOR, 'fill-opacity': 0.2 },
      },
      {
        id: 'measure-casing', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': INK, 'line-width': 6, 'line-opacity': 0.6 },
      },
      {
        id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': MEASURE_COLOR, 'line-width': 3 },
      },
      {
        id: 'measure-points', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
      },
      {
        id: 'notes-circle', type: 'circle', source: 'notes', layout: { visibility: 'none' },
        paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
      },
      {
        id: 'notes-number', type: 'symbol', source: 'notes',
        layout: {
          visibility: 'none', 'text-field': ['to-string', ['get', 'num']], 'text-font': ['Noto Sans Bold'], 'text-size': 12.5,
          'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      {
        id: 'projects-halo', type: 'circle', source: 'projects',
        paint: { 'circle-radius': 20, 'circle-color': MEASURE_COLOR, 'circle-opacity': 0.28 },
      },
      {
        id: 'projects-circle', type: 'circle', source: 'projects',
        paint: { 'circle-radius': 9, 'circle-color': MEASURE_COLOR, 'circle-stroke-color': INK, 'circle-stroke-width': 2.5 },
      },
      {
        id: 'projects-label', type: 'symbol', source: 'projects',
        layout: {
          'text-field': ['format', ['get', 'name'], {}, '\n', {}, ['get', 'subtitle'], { 'font-scale': 0.82, 'text-font': ['literal', ['Noto Sans Regular']] }],
          'text-font': ['Noto Sans Bold'], 'text-size': 15, 'text-anchor': 'left', 'text-offset': [1.5, 0], 'text-justify': 'left',
          'text-allow-overlap': true,
        },
        paint: textHalo,
      },
    ],
  };
}

function createBeforeStyle() {
  return {
    version: 8,
    sources: {
      empty: { type: 'geojson', data: EMPTY },
      study: { type: 'geojson', data: EMPTY },
      footprint: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1f2d2c' } },
      { id: 'anchor-imagery', type: 'line', source: 'empty' },
      {
        id: 'study-line', type: 'line', source: 'study', layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
      },
      {
        id: 'footprint-line', type: 'line', source: 'footprint', layout: { visibility: 'none' },
        paint: { 'line-color': PLAN_COLOR, 'line-width': 3 },
      },
    ],
  };
}

/* ------------------------------------------------------------------ carte principale */

const map = new maplibregl.Map({
  container: 'map',
  style: createStyle(),
  center: HOME.center,
  zoom: HOME.zoom - 0.6,
  maxZoom: 22,
  maxPitch: 72,
  attributionControl: false,
  locale: MAP_LOCALE,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.on('error', (event) => {
  // Une tuile manquante ne doit pas interrompre la démo ; on garde une trace pour le débogage.
  if (event?.error) console.warn('[carte]', event.error.message || event.error);
});

let beforeMap = null;
let beforeReady = null;
let popup = null;

// MapLibre ignore la toute première mesure de son conteneur : si la page finit sa mise en page juste après,
// la carte resterait à 400 × 300 px. On la redimensionne donc à chaque changement de taille de l'application.
new ResizeObserver(() => {
  map.resize();
  if (beforeMap && state.compare) beforeMap.resize();
  updateMapPadding();
  positionSwipe();
  if (state.flood) renderStaffScale();
}).observe(app);

// Le centre de la carte tient compte du panneau et des barres du bas : un projet s'affiche dans la zone libre.
function mapPadding() {
  const wide = window.matchMedia('(min-width: 761px)').matches;
  const panel = document.getElementById('panel');
  const left = wide && panel && !panel.hidden ? panel.offsetWidth + 24 : 0;
  return { top: 64, bottom: wide ? 150 : 180, left, right: 0 };
}

function updateMapPadding() {
  const padding = mapPadding();
  map.setPadding(padding);
  if (beforeMap) beforeMap.setPadding(padding);
}

const LATEST_IMAGERY = { release: LATEST_RELEASE, maxzoom: 19 };

function ensureImagery(target, { release, maxzoom = 19 }) {
  const id = `imagery-${release}-${maxzoom}`;
  if (!target.getSource(id)) {
    target.addSource(id, {
      type: 'raster', tiles: [WAYBACK_TILES(release)], tileSize: 256, maxzoom, attribution: ATTRIBUTION.esri,
    });
    target.addLayer({
      id, type: 'raster', source: id, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 },
    }, 'anchor-imagery');
  }
  return id;
}

function showImagery(target, imagery) {
  const visibleId = ensureImagery(target, imagery);
  for (const layer of target.getStyle().layers) {
    if (layer.id.startsWith('imagery-')) {
      target.setLayoutProperty(layer.id, 'visibility', layer.id === visibleId ? 'visible' : 'none');
    }
  }
}

function ensureDrone(project) {
  for (const image of project.drone?.images ?? []) {
    const id = `drone-${image.id}`;
    if (map.getSource(id)) continue;
    map.addSource(id, {
      type: 'raster', tiles: [image.tiles], tileSize: 256, bounds: image.bounds, minzoom: 14, maxzoom: 22,
      attribution: ATTRIBUTION.drone,
    });
    map.addLayer({
      id, type: 'raster', source: id, layout: { visibility: 'none' },
      paint: { 'raster-opacity': state.droneOpacity, 'raster-fade-duration': 150 },
    }, 'anchor-drone');
  }
}

const LAYER_GROUPS = {
  plan: ['plan-existing', 'plan-fill', 'plan-outline', 'plan-pipe-casing', 'plan-pipe', 'plan-point', 'plan-label'],
  buildings: ['buildings'],
  study: ['study-line'],
  notes: ['notes-circle', 'notes-number'],
  labels: ['labels-roads', 'labels-places'],
  footprint: ['footprint-fill', 'footprint-line', 'footprint-label'],
};

function syncBuildingsCheckbox() {
  const checkbox = document.getElementById('layer-buildings');
  if (checkbox) checkbox.checked = Boolean(state.layers.buildings);
}

// Les modes 3D et inondation affichent les bâtiments ; s'ils étaient masqués, on les masque à nouveau en sortant.
function showBuildingsForMode() {
  if (!state.project?.layers.some((layer) => layer.id === 'buildings') || state.layers.buildings) return;
  state.layers.buildings = true;
  state.buildingsAuto = true;
  syncBuildingsCheckbox();
}

function releaseBuildingsForMode() {
  if (!state.buildingsAuto || state.view3d || state.flood) return;
  state.layers.buildings = false;
  state.buildingsAuto = false;
  syncBuildingsCheckbox();
}

function setVisibility(target, id, visible) {
  if (target.getLayer(id)) target.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

function applyLayerVisibility() {
  const p = state.project;
  for (const [group, ids] of Object.entries(LAYER_GROUPS)) {
    const visible = group === 'labels' ? (!p || state.layers.labels !== false) : Boolean(p && state.layers[group]);
    ids.forEach((id) => setVisibility(map, id, visible));
  }
  const droneIds = new Set((p?.drone?.images ?? []).map((image) => `drone-${image.id}`));
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('drone-')) setVisibility(map, layer.id, droneIds.has(layer.id) && Boolean(state.layers.drone));
  }
  ['projects-halo', 'projects-circle', 'projects-label'].forEach((id) => setVisibility(map, id, !p));
  if (beforeMap && state.compare) {
    setVisibility(beforeMap, 'study-line', Boolean(state.layers.study));
    setVisibility(beforeMap, 'footprint-line', Boolean(state.layers.footprint));
  }
}

function bboxPolygon([west, south, east, north]) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
    }],
  };
}

async function loadJson(url) {
  if (!url) return null;
  if (!state.cache.has(url)) {
    state.cache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url} : ${response.status}`);
      return response.json();
    }));
  }
  try {
    return await state.cache.get(url);
  } catch (error) {
    state.cache.delete(url);
    console.error(error);
    toast('Une partie des données du projet n\'a pas pu être chargée.');
    return null;
  }
}

/* ------------------------------------------------------------------ navigation entre projets */

function moveCamera(camera, duration = 1800) {
  if (reducedMotion) map.jumpTo(camera);
  else map.flyTo({ ...camera, duration, essential: true });
}

async function openProject(id, { view = null } = {}) {
  const project = PROJECTS.find((p) => p.id === id);
  if (!project) {
    openHome();
    return;
  }
  const token = ++state.openToken;
  closeProjectMenu();
  resetModes();
  state.project = project;
  state.tab = 'layers';
  state.layers = Object.fromEntries(project.layers.map((layer) => [layer.id, layer.on]));
  state.buildingsAuto = false;
  state.date = view?.date && project.imagery.some((i) => i.date === view.date) ? view.date : project.defaultDate;
  state.compareDate = project.comparePreset?.before ?? project.imagery[0].date;
  state.floodLevel = project.flood?.initial ?? null;
  state.buildingElevations = [];
  state.hypsometry = null;
  state.overlay = { study: project.studyArea ? bboxPolygon(project.studyArea) : EMPTY, footprint: EMPTY, plan: EMPTY };
  app.dataset.view = 'project';
  $('#project-button-name').textContent = project.name;

  // 1. Tout ce qui ne dépend pas des fichiers de données s'affiche immédiatement.
  map.getSource('study').setData(state.overlay.study);
  ['plan', 'footprint', 'buildings'].forEach((source) => map.getSource(source).setData(EMPTY));
  ensureDrone(project);
  updateNotesSource();
  showImagery(map, imageryFor(state.date));
  applyLayerVisibility();
  renderPanel();
  renderTimeline();
  updateToolbar();
  renderReadout();
  if (view?.camera) map.jumpTo(view.camera);
  else moveCamera(project.camera);
  updateHash();

  // 2. Les bâtiments, le plan et les analyses arrivent ensuite.
  const [buildings, hypsometry, footprint, plan] = await Promise.all([
    loadJson(project.buildingsUrl), loadJson(project.hypsometryUrl), loadJson(project.footprintUrl),
    loadJson(project.planUrl),
  ]);
  if (token !== state.openToken) return;
  state.buildingElevations = buildings ? buildings.features.map((f) => f.properties.z).sort((a, b) => a - b) : [];
  state.hypsometry = hypsometry;
  state.overlay.footprint = footprint ?? EMPTY;
  state.overlay.plan = plan ?? EMPTY;
  map.getSource('plan').setData(state.overlay.plan);
  map.getSource('footprint').setData(state.overlay.footprint);
  map.getSource('buildings').setData(buildings ?? EMPTY);
  if (state.compare) updateBeforeMap();
  if (state.flood) updateFloodStyle();
  const scroll = $('.panel-scroll', $('#panel'))?.scrollTop ?? 0;
  renderPanel();
  const scroller = $('.panel-scroll', $('#panel'));
  if (scroller) scroller.scrollTop = scroll;
}

function openHome({ fly = true } = {}) {
  state.openToken += 1;
  closeProjectMenu();
  resetModes();
  state.project = null;
  app.dataset.view = 'home';
  $('#project-button-name').textContent = 'Tous les projets';
  showImagery(map, LATEST_IMAGERY);
  ['study', 'plan', 'footprint', 'buildings', 'notes', 'measure'].forEach((id) => map.getSource(id).setData(EMPTY));
  applyLayerVisibility();
  renderPanel();
  renderTimeline();
  updateToolbar();
  renderReadout();
  if (fly) moveCamera({ center: HOME.center, zoom: HOME.zoom, bearing: 0, pitch: 0 }, 1600);
  updateHash();
}

function resetModes() {
  if (state.compare) exitCompare();
  if (state.flood) setFlood(false);
  if (state.view3d) setView3d(false, { jump: true });
  setTool('pan');
  popup?.remove();
}

function imageryFor(date, project = state.project) {
  return project?.imagery.find((i) => i.date === date) ?? LATEST_IMAGERY;
}

function setDate(date) {
  const project = state.project;
  if (!project?.imagery.some((i) => i.date === date)) return;
  state.date = date;
  showImagery(map, imageryFor(date));
  renderTimeline();
  $('#compare-after').textContent = formatDate(date, 'day');
  updateHash();
}

/* ------------------------------------------------------------------ panneau latéral */

function notesFor(project) {
  if (!project) return [];
  return [
    ...(project.notes ?? []).map((note) => ({ ...note, example: true })),
    ...(state.userNotes[project.id] ?? []),
  ];
}

function layerMeta(project, layer) {
  if (layer.id === 'buildings' && state.buildingElevations.length) {
    return `${formatNumber(state.buildingElevations.length)} bâtiments, OpenStreetMap`;
  }
  if (layer.id === 'study' && state.hypsometry) {
    const total = state.hypsometry.hectaresBelow.at(-1);
    return `${formatNumber(total)} ha analysés`;
  }
  if (layer.id === 'notes') {
    const count = notesFor(project).length;
    return count ? `${count} note${count > 1 ? 's' : ''}` : 'Aucune note';
  }
  if (layer.id === 'footprint') {
    const area = state.overlay.footprint.features?.[0]?.properties?.areaHa;
    return area ? `${formatNumber(area, 1)} ha, OpenStreetMap` : layer.meta;
  }
  return layer.meta;
}

function projectCard(project) {
  const last = project.imagery.at(-1);
  return `<li>
    <button type="button" class="project-card" data-project="${project.id}">
      <span class="card-name">${escapeHtml(project.name)}</span>
      <span class="card-sub">${escapeHtml(project.subtitle)}, ${escapeHtml(project.place)}</span>
      <span class="card-facts">
        <span class="fact">${escapeHtml(project.status)}</span>
        <span class="fact">${project.imagery.length} dates d'images, jusqu'à ${formatDate(last.date, 'short')}</span>
        ${project.drone ? '<span class="fact">Orthophoto drone</span>' : ''}
      </span>
    </button>
  </li>`;
}

function tabButton(id, label, count) {
  const selected = state.tab === id;
  return `<button type="button" class="tab" role="tab" id="tab-${id}" aria-controls="tabpanel-${id}"
    aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-tab="${id}">${label}${
    count != null ? `<span class="count">${count}</span>` : ''}</button>`;
}

function layersHtml(project) {
  return `<ul class="layer-list">${project.layers.map((layer) => {
    const meta = layerMeta(project, layer);
    const opacity = Math.round(state.droneOpacity * 100);
    return `<li>
      <label class="layer-row" for="layer-${layer.id}">
        <input type="checkbox" id="layer-${layer.id}" data-layer="${layer.id}" ${state.layers[layer.id] ? 'checked' : ''}>
        <span class="swatch swatch-${layer.swatch}" aria-hidden="true"></span>
        <span class="layer-text">
          <span class="layer-name">${escapeHtml(layer.name)}</span>
          ${meta ? `<span class="layer-meta">${escapeHtml(meta)}</span>` : ''}
        </span>
      </label>
      ${layer.opacity ? `<div class="layer-opacity">
        <label for="opacity-${layer.id}">Opacité</label>
        <input type="range" id="opacity-${layer.id}" data-opacity="${layer.id}" min="0" max="100" step="5" value="${opacity}">
        <output for="opacity-${layer.id}">${opacity} %</output>
      </div>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function notesHtml(project) {
  const notes = notesFor(project);
  return `<p class="empty-hint">${notes.length
    ? 'Les notes sont visibles par toute l\'équipe du projet. Pour en ajouter une, choisissez l\'outil Note puis cliquez sur la carte.'
    : 'Aucune note pour l\'instant. Choisissez l\'outil Note, puis cliquez sur la carte.'}</p>
  <ol class="notes-list">${notes.map((note, index) => {
    const category = CATEGORIES[note.category] ?? CATEGORIES.information;
    return `<li class="note-item">
      <span class="note-num" style="background:${category.color}" aria-hidden="true">${index + 1}</span>
      <div class="note-body">
        <h3 class="note-title">${escapeHtml(note.title)}${note.example ? '<span class="chip-example">exemple</span>' : ''}</h3>
        <p class="note-meta">${category.label}, ${escapeHtml(note.author)}, ${formatDate(note.date, 'day')}</p>
        ${note.text ? `<p class="note-text">${escapeHtml(note.text)}</p>` : ''}
        <div class="note-actions">
          <button type="button" class="link-button" data-goto="${escapeHtml(note.id)}">Voir sur la carte</button>
          ${note.example ? '' : `<button type="button" class="link-button danger" data-delete="${escapeHtml(note.id)}">Supprimer</button>`}
        </div>
      </div>
    </li>`;
  }).join('')}</ol>`;
}

function infoHtml(project) {
  const first = project.imagery[0].date;
  const last = project.imagery.at(-1).date;
  const facts = [
    ['Statut', escapeHtml(project.status)],
    ['Lieu', escapeHtml(project.place)],
  ];
  if (state.hypsometry) {
    facts.push(['Zone d\'étude', `${formatNumber(state.hypsometry.hectaresBelow.at(-1))} ha`]);
    facts.push(['Altitude du terrain', `${formatNumber(state.hypsometry.terrainMin)} à ${formatNumber(state.hypsometry.terrainMax)} m`]);
  }
  if (state.buildingElevations.length) facts.push(['Bâtiments', formatNumber(state.buildingElevations.length)]);
  const area = state.overlay.footprint.features?.[0]?.properties?.areaHa;
  if (area) facts.push(['Emprise', `${formatNumber(area, 1)} ha`]);
  facts.push(['Images', `${project.imagery.length} dates, de ${formatDate(first, 'short')} à ${formatDate(last, 'short')}`]);
  const data = [
    `<li><strong>Imagerie satellite</strong> : Esri et archives Wayback, ${project.imagery.length} prises de vue.</li>`,
    project.drone ? `<li><strong>Orthophoto drone</strong> : ${project.drone.dates}, ${project.drone.resolution} (WeRobotics, CC BY 4.0).</li>` : '',
    project.buildingsUrl ? '<li><strong>Bâtiments</strong> : OpenStreetMap, altitude du sol calculée pour chacun.</li>' : '',
    project.flood ? '<li><strong>Relief</strong> : modèle SRTM, 30 m, pour la simulation d\'inondation.</li>' : '',
    project.planUrl ? '<li><strong>Plan du projet</strong> : tracé fictif le long de rues réelles ; bassins existants d\'après OpenStreetMap.</li>' : '',
  ].join('');
  return `<p class="panel-intro">${escapeHtml(project.summary)}</p>
    <dl class="facts">${facts.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}</dl>
    <h3 class="section-title">Données utilisées</h3>
    <ul class="data-list">${data}</ul>`;
}

function renderPanel() {
  const panel = $('#panel');
  const project = state.project;
  if (!project) {
    panel.innerHTML = `<div class="panel-head">
        <h1>${HOME.title}</h1>
        <p>${PROJECTS.length} projets dans l'espace de démonstration</p>
      </div>
      <div class="panel-scroll">
        <p class="panel-intro">${escapeHtml(HOME.intro)}</p>
        <ul class="project-list">${PROJECTS.map(projectCard).join('')}</ul>
        <p class="panel-footnote">Les lieux, les images et les bâtiments sont réels. Les projets, les plans et les notes sont fictifs.</p>
      </div>`;
    return;
  }
  panel.innerHTML = `<div class="panel-head">
      <h1>${escapeHtml(project.name)}</h1>
      <p>${escapeHtml(project.subtitle)}, ${escapeHtml(project.place)}</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Contenu du projet">
      ${tabButton('layers', 'Couches')}${tabButton('notes', 'Notes', notesFor(project).length)}${tabButton('info', 'Projet')}
    </div>
    <div class="panel-scroll">
      <section class="tab-panel" role="tabpanel" id="tabpanel-layers" aria-labelledby="tab-layers" ${state.tab === 'layers' ? '' : 'hidden'}>${layersHtml(project)}</section>
      <section class="tab-panel" role="tabpanel" id="tabpanel-notes" aria-labelledby="tab-notes" ${state.tab === 'notes' ? '' : 'hidden'}>${notesHtml(project)}</section>
      <section class="tab-panel" role="tabpanel" id="tabpanel-info" aria-labelledby="tab-info" ${state.tab === 'info' ? '' : 'hidden'}>${infoHtml(project)}</section>
    </div>`;
}

function selectTab(id, { focus = false } = {}) {
  state.tab = id;
  $$('.tab', $('#panel')).forEach((tab) => {
    const selected = tab.dataset.tab === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  $$('.tab-panel', $('#panel')).forEach((panel) => { panel.hidden = panel.id !== `tabpanel-${id}`; });
}

$('#panel').addEventListener('click', (event) => {
  const card = event.target.closest('[data-project]');
  if (card) {
    openProject(card.dataset.project);
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    selectTab(tab.dataset.tab);
    return;
  }
  const goto = event.target.closest('[data-goto]');
  if (goto) {
    showNotePopup(goto.dataset.goto, { fly: true });
    return;
  }
  const remove = event.target.closest('[data-delete]');
  if (remove) deleteNote(remove.dataset.delete);
});

$('#panel').addEventListener('keydown', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = $$('.tab', $('#panel'));
  const index = tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1);
  selectTab(tabs[(index + tabs.length) % tabs.length].dataset.tab, { focus: true });
  event.preventDefault();
});

$('#panel').addEventListener('change', (event) => {
  const input = event.target.closest('[data-layer]');
  if (!input) return;
  state.layers[input.dataset.layer] = input.checked;
  if (input.dataset.layer === 'buildings') {
    state.buildingsAuto = false;
    if (!input.checked && state.flood) setFlood(false);
  }
  applyLayerVisibility();
});

$('#panel').addEventListener('input', (event) => {
  const slider = event.target.closest('[data-opacity]');
  if (!slider) return;
  state.droneOpacity = Number(slider.value) / 100;
  slider.nextElementSibling.textContent = `${slider.value} %`;
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('drone-')) map.setPaintProperty(layer.id, 'raster-opacity', state.droneOpacity);
  }
});

/* ------------------------------------------------------------------ frise des dates */

function renderTimeline() {
  const timeline = $('#timeline');
  const project = state.project;
  timeline.hidden = !project;
  if (!project) return;
  timeline.innerHTML = project.imagery.map((image) => {
    const checked = image.date === state.date;
    const before = state.compare && image.date === state.compareDate;
    return `<button type="button" class="tl-node${before ? ' is-before' : ''}" role="radio" aria-checked="${checked}"
      tabindex="${checked ? 0 : -1}" data-date="${image.date}" title="Image du ${formatDate(image.date)}">
      <span class="tl-dot" aria-hidden="true"></span>
      <span class="tl-label">${formatDate(image.date, 'short')}</span>
      ${image.tag ? `<span class="tl-tag">${escapeHtml(image.tag)}</span>` : ''}
    </button>`;
  }).join('');
  $('[aria-checked="true"]', timeline)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

$('#timeline').addEventListener('click', (event) => {
  const node = event.target.closest('[data-date]');
  if (node) setDate(node.dataset.date);
});

$('#timeline').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !state.project) return;
  const dates = state.project.imagery.map((i) => i.date);
  let index = dates.indexOf(state.date);
  if (event.key === 'ArrowLeft') index -= 1;
  if (event.key === 'ArrowRight') index += 1;
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = dates.length - 1;
  setDate(dates[clamp(index, 0, dates.length - 1)]);
  $('[aria-checked="true"]', $('#timeline'))?.focus();
  event.preventDefault();
});

/* ------------------------------------------------------------------ outils */

function updateToolbar() {
  const project = state.project;
  $('#toolbar').hidden = !project;
  $$('.tool[data-tool]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.tool === state.tool));
    button.setAttribute('aria-disabled', String(state.compare && button.dataset.tool !== 'pan'));
  });
  $('#compare-toggle').setAttribute('aria-pressed', String(state.compare));
  $('#view3d-toggle').setAttribute('aria-pressed', String(state.view3d));
  $('#view3d-toggle').setAttribute('aria-disabled', String(state.compare));
  const flood = $('#flood-toggle');
  flood.hidden = !project?.flood;
  flood.setAttribute('aria-pressed', String(state.flood));
}

function setTool(tool) {
  if (state.compare && tool !== 'pan') {
    toast('Quittez la comparaison pour mesurer ou ajouter une note.');
    return;
  }
  if (tool !== state.tool) clearMeasure();
  state.tool = tool;
  map.getCanvas().style.cursor = tool === 'pan' ? '' : 'crosshair';
  if (tool === 'pan') map.doubleClickZoom.enable();
  else map.doubleClickZoom.disable();
  updateToolbar();
  renderReadout();
}

$$('.tool[data-tool]').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool === state.tool ? 'pan' : button.dataset.tool));
});
$('#compare-toggle').addEventListener('click', () => (state.compare ? exitCompare() : enterCompare()));
$('#view3d-toggle').addEventListener('click', () => setView3d(!state.view3d));
$('#flood-toggle').addEventListener('click', () => setFlood(!state.flood));

/* mesures */

const isMeasuring = () => state.tool === 'distance' || state.tool === 'area';

function measurePoints() {
  const { points, cursor, done } = state.measure;
  return done || !cursor ? points : [...points, cursor];
}

function clearMeasure() {
  state.measure = { points: [], cursor: null, done: false };
  map.getSource('measure')?.setData(EMPTY);
  renderReadout();
}

function updateMeasureSource() {
  const points = measurePoints();
  const features = [];
  const closed = state.tool === 'area' && points.length >= 3;
  if (closed) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } });
  }
  if (points.length >= 2) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: closed ? [...points, points[0]] : points } });
  }
  state.measure.points.forEach((point) => {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } });
  });
  map.getSource('measure').setData({ type: 'FeatureCollection', features });
}

function finishMeasure() {
  const points = state.measure.points.filter((point, i, all) => i === 0 || distance(point, all[i - 1]) > 0.05);
  state.measure.points = points;
  if (points.length < (state.tool === 'area' ? 3 : 2)) {
    renderReadout();
    return;
  }
  state.measure.done = true;
  state.measure.cursor = null;
  updateMeasureSource();
  renderReadout();
}

function renderReadout() {
  const readout = $('#readout');
  if (!state.project || state.tool === 'pan') {
    readout.hidden = true;
    readout.innerHTML = '';
    return;
  }
  readout.hidden = false;
  const cancel = '<button type="button" data-action="cancel-tool">Annuler</button>';
  if (state.tool === 'note') {
    readout.innerHTML = `<span>Cliquez sur la carte à l'endroit de l'observation.</span>${cancel}`;
    return;
  }
  if (!state.measure.points.length) {
    readout.innerHTML = `<span>${state.tool === 'distance'
      ? 'Cliquez pour placer le premier point, double-cliquez pour terminer.'
      : 'Cliquez pour placer les sommets, double-cliquez pour fermer la surface.'}</span>${cancel}`;
    return;
  }
  const points = measurePoints();
  const actions = state.measure.done
    ? '<button type="button" data-action="clear-measure">Effacer</button>'
    : '<button type="button" data-action="finish-measure">Terminer</button><button type="button" data-action="clear-measure">Effacer</button>';
  if (state.tool === 'distance') {
    readout.innerHTML = `<span>Distance</span><output class="readout-value">${formatLength(pathLength(points))}</output>${actions}`;
  } else {
    readout.innerHTML = `<span>Surface</span><output class="readout-value">${points.length >= 3 ? formatArea(polygonArea(points)) : '…'}</output>
      <span class="readout-secondary">périmètre ${formatLength(polygonPerimeter(points))}</span>${actions}`;
  }
}

$('#readout').addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'cancel-tool') setTool('pan');
  if (action === 'clear-measure') clearMeasure();
  if (action === 'finish-measure') finishMeasure();
});

/* ------------------------------------------------------------------ notes */

function updateNotesSource() {
  const project = state.project;
  const features = notesFor(project).map((note, index) => ({
    type: 'Feature',
    properties: { nid: note.id, num: index + 1, color: (CATEGORIES[note.category] ?? CATEGORIES.information).color },
    geometry: { type: 'Point', coordinates: note.lngLat },
  }));
  map.getSource('notes').setData({ type: 'FeatureCollection', features });
}

function showNotePopup(id, { fly = false } = {}) {
  const notes = notesFor(state.project);
  const index = notes.findIndex((note) => note.id === id);
  if (index < 0) return;
  const note = notes[index];
  const category = CATEGORIES[note.category] ?? CATEGORIES.information;
  if (!state.layers.notes) {
    state.layers.notes = true;
    const checkbox = $('#layer-notes');
    if (checkbox) checkbox.checked = true;
    applyLayerVisibility();
  }
  if (fly) moveCamera({ center: note.lngLat, zoom: Math.max(map.getZoom(), 17.3) }, 900);
  popup?.remove();
  popup = new maplibregl.Popup({ offset: 16, maxWidth: '300px', focusAfterOpen: false })
    .setLngLat(note.lngLat)
    .setHTML(`<span class="popup-category"><i style="background:${category.color}"></i>${category.label}, note ${index + 1}</span>
      <h3 class="popup-title">${escapeHtml(note.title)}</h3>
      ${note.text ? `<p class="popup-text">${escapeHtml(note.text)}</p>` : ''}
      <p class="popup-meta">${escapeHtml(note.author)}, ${formatDate(note.date, 'day')}${note.example ? ' (exemple)' : ''}</p>`)
    .addTo(map);
  if (!fly) requestAnimationFrame(keepPopupVisible);
  else map.once('moveend', keepPopupVisible);
}

function keepPopupVisible() {
  const element = popup?.getElement();
  if (!element) return;
  const box = element.getBoundingClientRect();
  const area = app.getBoundingClientRect();
  const padding = mapPadding();
  const top = area.top + padding.top + 8;
  const left = area.left + padding.left + 8;
  const right = area.right - (state.flood ? 260 : 64);
  const dx = box.left < left ? box.left - left : (box.right > right ? box.right - right : 0);
  const dy = box.top < top ? box.top - top : 0;
  if (dx || dy) map.panBy([dx, dy], { duration: reducedMotion ? 0 : 300 });
}

let pendingNotePosition = null;

function openNoteDialog(lngLat) {
  pendingNotePosition = [Number(lngLat.lng.toFixed(6)), Number(lngLat.lat.toFixed(6))];
  $('#note-form').reset();
  $('#note-position').textContent = `Position : ${formatCoordinates(lngLat.lng, lngLat.lat)}`;
  $('#note-category').value = 'information';
  $('#note-dialog').showModal();
  $('#note-title').focus();
}

$('#note-category').innerHTML = Object.entries(CATEGORIES)
  .map(([value, category]) => `<option value="${value}">${category.label}</option>`).join('');

$('#note-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const title = String(form.get('title') ?? '').trim();
  if (!title || !state.project || !pendingNotePosition) {
    $('#note-title').focus();
    return;
  }
  const note = {
    id: `u-${Date.now()}`,
    lngLat: pendingNotePosition,
    title,
    text: String(form.get('text') ?? '').trim(),
    category: String(form.get('category') ?? 'information'),
    author: 'Vous',
    date: todayIso(),
  };
  (state.userNotes[state.project.id] ||= []).push(note);
  writeUserNotes();
  $('#note-dialog').close();
  setTool('pan');
  updateNotesSource();
  state.tab = 'notes';
  renderPanel();
  toast('Note ajoutée');
  showNotePopup(note.id);
});

$('#note-cancel').addEventListener('click', () => $('#note-dialog').close());

function deleteNote(id) {
  const project = state.project;
  if (!project) return;
  state.userNotes[project.id] = (state.userNotes[project.id] ?? []).filter((note) => note.id !== id);
  writeUserNotes();
  popup?.remove();
  updateNotesSource();
  renderPanel();
  toast('Note supprimée');
}

/* ------------------------------------------------------------------ vue 3D */

function setView3d(on, { jump = false } = {}) {
  if (on && state.compare) {
    toast('La vue 3D n\'est pas disponible pendant la comparaison.');
    return;
  }
  state.view3d = on;
  map.setTerrain(on ? { source: 'dem-terrain', exaggeration: EXAGGERATION } : null);
  map.setPaintProperty('buildings', 'fill-extrusion-height', on ? ['get', 'h'] : 0.4);
  popup?.remove();
  if (on) showBuildingsForMode();
  else releaseBuildingsForMode();
  applyLayerVisibility();
  const camera = on
    ? { pitch: 62, bearing: map.getBearing() || -24 }
    : { pitch: 0, bearing: 0 };
  if (jump || reducedMotion) map.jumpTo(camera);
  else map.easeTo({ ...camera, duration: on ? 1400 : 800 });
  updateToolbar();
  if (on) toast(`Vue 3D : le relief est exagéré ${EXAGGERATION} fois pour être lisible.`);
  updateHash();
}

/* ------------------------------------------------------------------ simulation d'inondation */

function setFlood(on) {
  const project = state.project;
  if (on && !project?.flood) return;
  state.flood = on;
  popup?.remove();
  if (on) {
    if (state.floodLevel == null) state.floodLevel = project.flood.initial;
    showBuildingsForMode();
  } else {
    releaseBuildingsForMode();
  }
  setVisibility(map, 'flood', on);
  $('#gauge').hidden = !on;
  if (on) renderStaffScale();
  applyLayerVisibility();
  updateFloodStyle();
  updateToolbar();
  updateHash();
}

function countBelow(sorted, level) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < level) low = mid + 1;
    else high = mid;
  }
  return low;
}

function hectaresBelow(level) {
  const h = state.hypsometry;
  if (!h) return 0;
  const index = Math.floor((level - h.start) / h.step) - 1;
  if (index < 0) return 0;
  return h.hectaresBelow[Math.min(index, h.hectaresBelow.length - 1)];
}

function updateFloodStyle() {
  const level = state.floodLevel;
  if (level != null) map.setPaintProperty('flood', 'color-relief-color', floodRamp(level));
  map.setPaintProperty('buildings', 'fill-extrusion-color', state.flood && level != null
    ? ['case', ['<', ['get', 'z'], level], EXPOSED_COLOR, BUILDING_COLOR]
    : BUILDING_COLOR);
  if (!state.flood || !state.project?.flood) return;
  const { min, max } = state.project.flood;
  const ratio = (level - min) / (max - min);
  $('#staff-water').style.height = `${ratio * 100}%`;
  $('#staff-handle').style.bottom = `${ratio * 100}%`;
  const staff = $('#staff');
  staff.setAttribute('aria-valuemin', String(min));
  staff.setAttribute('aria-valuemax', String(max));
  staff.setAttribute('aria-valuenow', String(level));
  staff.setAttribute('aria-valuetext', `${formatNumber(level, 1)} mètres d'altitude`);
  $('#gauge-value').textContent = `${formatNumber(level, 1)} m`;
  $('#stat-buildings').textContent = formatNumber(countBelow(state.buildingElevations, level));
  $('#stat-area').textContent = `${formatNumber(hectaresBelow(level))} ha`;
}

function renderStaffScale() {
  const project = state.project;
  if (!project?.flood) return;
  const { min, max } = project.flood;
  const staff = $('#staff');
  const width = staff.clientWidth;
  const height = staff.clientHeight;
  if (!width || !height) return;
  let marks = '';
  for (let m = Math.ceil(min * 2) / 2; m <= max + 1e-9; m += 0.5) {
    const y = height - ((m - min) / (max - min)) * height;
    const whole = Number.isInteger(Math.round(m * 2) / 2) && Math.abs(m - Math.round(m)) < 1e-9;
    // Motif en « E » des mires de nivellement : une barre pleine par mètre, une demi-barre à mi-hauteur.
    marks += `<rect class="tick" x="0" y="${(y - (whole ? 1.3 : 0.8)).toFixed(1)}" width="${(width * (whole ? 0.5 : 0.28)).toFixed(1)}" height="${whole ? 2.6 : 1.6}"/>`;
    if (whole && Math.round(m) % 2 === 0) {
      marks += `<text class="num" x="${width - 5}" y="${(y + 4.5).toFixed(1)}" text-anchor="end">${Math.round(m)}</text>`;
    }
  }
  const svg = $('#staff-scale');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = marks;
}

let floodFrame = 0;
function setFloodLevel(level) {
  const { min, max } = state.project.flood;
  state.floodLevel = Math.round(clamp(level, min, max) * 10) / 10;
  if (floodFrame) return;
  floodFrame = requestAnimationFrame(() => {
    floodFrame = 0;
    updateFloodStyle();
  });
}

(() => {
  const staff = $('#staff');
  let dragging = false;
  const levelAt = (clientY) => {
    const rect = staff.getBoundingClientRect();
    const { min, max } = state.project.flood;
    return min + (1 - (clientY - rect.top) / rect.height) * (max - min);
  };
  staff.addEventListener('pointerdown', (event) => {
    if (!state.project?.flood) return;
    dragging = true;
    staff.setPointerCapture(event.pointerId);
    setFloodLevel(levelAt(event.clientY));
  });
  staff.addEventListener('pointermove', (event) => {
    if (dragging) setFloodLevel(levelAt(event.clientY));
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    updateHash();
  };
  staff.addEventListener('pointerup', stop);
  staff.addEventListener('pointercancel', stop);
  staff.addEventListener('keydown', (event) => {
    if (!state.project?.flood) return;
    const { min, max } = state.project.flood;
    const step = event.shiftKey ? 1 : 0.1;
    const moves = {
      ArrowUp: state.floodLevel + step, ArrowRight: state.floodLevel + step,
      ArrowDown: state.floodLevel - step, ArrowLeft: state.floodLevel - step,
      PageUp: state.floodLevel + 1, PageDown: state.floodLevel - 1, Home: min, End: max,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setFloodLevel(moves[event.key]);
    updateHash();
  });
})();

/* ------------------------------------------------------------------ comparaison de deux dates */

let syncing = false;
function mirror(from, to) {
  if (syncing || !to) return;
  syncing = true;
  to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
  syncing = false;
}

function ensureBeforeMap() {
  if (beforeReady) return beforeReady;
  beforeMap = new maplibregl.Map({
    container: 'map-before',
    style: createBeforeStyle(),
    center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(),
    maxZoom: 22, maxPitch: 72, attributionControl: false, locale: MAP_LOCALE,
  });
  beforeMap.setPadding(mapPadding());
  beforeMap.on('error', (event) => { if (event?.error) console.warn('[carte avant]', event.error.message || event.error); });
  beforeReady = new Promise((resolve) => beforeMap.once('load', resolve)).then(() => {
    map.on('move', () => { if (state.compare) mirror(map, beforeMap); });
    beforeMap.on('move', () => { if (state.compare) mirror(beforeMap, map); });
    beforeMap.on('moveend', () => { if (state.compare) updateHash(); });
  });
  return beforeReady;
}

function updateBeforeMap() {
  if (!beforeMap || !state.project) return;
  showImagery(beforeMap, imageryFor(state.compareDate));
  beforeMap.getSource('study').setData(state.overlay.study);
  beforeMap.getSource('footprint').setData(state.overlay.footprint);
  applyLayerVisibility();
}

function renderCompareLabels() {
  $('#compare-date').innerHTML = state.project.imagery
    .map((image) => `<option value="${image.date}" ${image.date === state.compareDate ? 'selected' : ''}>${formatDate(image.date, 'day')}</option>`)
    .join('');
  $('#compare-after').textContent = formatDate(state.date, 'day');
}

function positionSwipe() {
  if (!state.compare) return;
  const x = Math.round(state.swipeX * app.clientWidth);
  app.style.setProperty('--swipe-x', `${x}px`);
  $('#map').style.clipPath = `inset(0 0 0 ${x}px)`;
}

async function enterCompare() {
  const project = state.project;
  if (!project) return;
  if (state.view3d) setView3d(false, { jump: true });
  setTool('pan');
  popup?.remove();
  state.compare = true;
  if (project.comparePreset && state.date === project.defaultDate) {
    state.compareDate = project.comparePreset.before;
    setDate(project.comparePreset.after);
  }
  $('#map-before').hidden = false;
  await ensureBeforeMap();
  if (!state.compare) return;
  beforeMap.resize();
  mirror(map, beforeMap);
  updateBeforeMap();
  renderCompareLabels();
  $('#swipe').hidden = false;
  positionSwipe();
  renderTimeline();
  updateToolbar();
  updateHash();
}

function exitCompare() {
  state.compare = false;
  app.style.removeProperty('--swipe-x');
  $('#swipe').hidden = true;
  $('#map-before').hidden = true;
  $('#map').style.clipPath = '';
  renderTimeline();
  updateToolbar();
  updateHash();
}

$('#compare-date').addEventListener('change', (event) => {
  state.compareDate = event.target.value;
  updateBeforeMap();
  renderTimeline();
  updateHash();
});

(() => {
  const handle = $('#swipe-handle');
  let dragging = false;
  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = app.getBoundingClientRect();
    state.swipeX = clamp((event.clientX - rect.left) / rect.width, 0.04, 0.96);
    positionSwipe();
  });
  const stop = () => { dragging = false; };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('keydown', (event) => {
    const moves = { ArrowLeft: -0.03, ArrowRight: 0.03 };
    if (event.key in moves) state.swipeX = clamp(state.swipeX + moves[event.key], 0.04, 0.96);
    else if (event.key === 'Home') state.swipeX = 0.04;
    else if (event.key === 'End') state.swipeX = 0.96;
    else return;
    event.preventDefault();
    positionSwipe();
  });
})();

/* ------------------------------------------------------------------ lien partageable */

function updateHash() {
  // Tant que la vue demandée par le lien n'est pas restaurée, on ne réécrit pas l'adresse.
  if (state.restoring || !state.ready) return;
  const parts = [];
  if (state.project) parts.push(`projet=${state.project.id}`, `date=${state.date}`);
  const center = map.getCenter();
  parts.push(`vue=${[center.lng.toFixed(5), center.lat.toFixed(5), map.getZoom().toFixed(2),
    Math.round(map.getBearing()), Math.round(map.getPitch())].join(',')}`);
  const modes = [];
  if (state.compare) modes.push('comparer');
  if (state.view3d) modes.push('3d');
  if (state.flood) modes.push('inondation');
  if (modes.length) parts.push(`modes=${modes.join(',')}`);
  if (state.compare) parts.push(`avant=${state.compareDate}`);
  if (state.flood && state.floodLevel != null) parts.push(`niveau=${state.floodLevel.toFixed(1)}`);
  history.replaceState(null, '', `#${parts.join('&')}`);
}

function parseHash() {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const view = (params.get('vue') ?? '').split(',').map(Number);
  return {
    project: params.get('projet'),
    date: params.get('date'),
    camera: view.length === 5 && view.every(Number.isFinite)
      ? { center: [view[0], view[1]], zoom: view[2], bearing: view[3], pitch: view[4] } : null,
    modes: (params.get('modes') ?? '').split(',').filter(Boolean),
    before: params.get('avant'),
    level: Number(params.get('niveau')),
  };
}

$('#share-button').addEventListener('click', async () => {
  updateHash();
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Lien copié : il ouvre cette vue, à cette date.');
  } catch {
    toast('Copie impossible ici : copiez l\'adresse affichée dans le navigateur.');
  }
});

/* ------------------------------------------------------------------ export d'image */

function attributionLine() {
  const project = state.project;
  const parts = ['Imagerie © Esri, Maxar, Vantor', '© OpenStreetMap'];
  if (project?.drone && state.layers.drone) parts.push('drone WeRobotics (CC BY 4.0)');
  if (state.flood || state.view3d) parts.push('relief SRTM');
  return `${parts.join(' ; ')}. Démo gisgis : plans et notes fictifs.`;
}

function exportImage() {
  map.once('render', () => {
    try {
      const source = map.getCanvas();
      const ratio = source.width / source.clientWidth;
      const band = Math.round(58 * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height + band;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      ctx.fillStyle = INK;
      ctx.fillRect(0, source.height, canvas.width, band);
      const project = state.project;
      const title = project
        ? `${project.name}, ${project.subtitle.toLowerCase()} : image du ${formatDate(state.date)}`
        : 'Projets de la démo gisgis';
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.round(17 * ratio)}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
      ctx.fillText(title, 16 * ratio, source.height + 25 * ratio);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = `400 ${Math.round(12 * ratio)}px Barlow, Arial, sans-serif`;
      ctx.fillText(attributionLine(), 16 * ratio, source.height + 45 * ratio);
      canvas.toBlob((blob) => {
        if (!blob) {
          toast('Export impossible : l\'image n\'a pas pu être générée.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gisgis-${project?.id ?? 'projets'}-${state.date ?? 'carte'}.jpg`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('Image exportée, avec ses sources en bas de l\'image.');
      }, 'image/jpeg', 0.88);
    } catch (error) {
      console.error(error);
      toast('Export impossible : une des sources d\'images refuse la copie.');
    }
  });
  map.triggerRepaint();
}

$('#export-button').addEventListener('click', exportImage);

/* ------------------------------------------------------------------ menus, dialogues, toast */

function renderProjectMenu() {
  $('#project-menu').innerHTML = [
    `<button type="button" data-menu-project="" aria-current="${!state.project}">
      <span class="menu-name">Tous les projets</span><span class="menu-sub">Vue d'ensemble de l'espace</span></button>`,
    ...PROJECTS.map((p) => `<button type="button" data-menu-project="${p.id}" aria-current="${state.project?.id === p.id}">
      <span class="menu-name">${escapeHtml(p.name)}</span><span class="menu-sub">${escapeHtml(p.subtitle)}</span></button>`),
  ].join('');
}

function closeProjectMenu() {
  $('#project-menu').hidden = true;
  $('#project-button').setAttribute('aria-expanded', 'false');
}

$('#project-button').addEventListener('click', (event) => {
  event.stopPropagation();
  const menu = $('#project-menu');
  const opening = menu.hidden;
  if (opening) renderProjectMenu();
  menu.hidden = !opening;
  $('#project-button').setAttribute('aria-expanded', String(opening));
  if (opening) $('button', menu)?.focus();
});

$('#project-menu').addEventListener('click', (event) => {
  const item = event.target.closest('[data-menu-project]');
  if (!item) return;
  closeProjectMenu();
  if (item.dataset.menuProject) openProject(item.dataset.menuProject);
  else openHome();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.project-switch')) closeProjectMenu();
});

$('#home-link').addEventListener('click', (event) => {
  event.preventDefault();
  openHome();
});

$('#sources-body').innerHTML = `<ul class="source-list">${SOURCES.map((source) => `<li>
  <h3>${escapeHtml(source.title)}</h3>
  <p>${escapeHtml(source.text)}</p>
  ${source.license ? `<span class="source-license">Licence : ${escapeHtml(source.license)}</span>` : ''}
</li>`).join('')}</ul>`;
$('#sources-button').addEventListener('click', () => $('#sources-dialog').showModal());
$('#sources-close').addEventListener('click', () => $('#sources-dialog').close());

$('#panel-toggle').addEventListener('click', () => {
  const collapsed = app.classList.toggle('panel-collapsed');
  $('#panel-toggle').setAttribute('aria-expanded', String(!collapsed));
});
if (window.matchMedia('(max-width: 760px)').matches) {
  app.classList.add('panel-collapsed');
  $('#panel-toggle').setAttribute('aria-expanded', 'false');
}

let toastTimer = 0;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}

document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, select, dialog')) return;
  if (event.key === 'Escape') {
    if (!$('#project-menu').hidden) closeProjectMenu();
    else if (state.tool !== 'pan') setTool('pan');
    else popup?.remove();
  }
  if (event.key === 'Enter' && isMeasuring() && !state.measure.done) finishMeasure();
});

/* ------------------------------------------------------------------ interactions carte */

map.on('click', (event) => {
  if (!state.project) {
    const hit = map.queryRenderedFeatures(event.point, { layers: ['projects-circle', 'projects-label', 'projects-halo'] })[0];
    if (hit) openProject(hit.properties.id);
    return;
  }
  if (isMeasuring()) {
    if (state.measure.done) clearMeasure();
    state.measure.points.push([event.lngLat.lng, event.lngLat.lat]);
    updateMeasureSource();
    renderReadout();
    return;
  }
  if (state.tool === 'note') {
    openNoteDialog(event.lngLat);
    return;
  }
  const note = map.queryRenderedFeatures(event.point, { layers: ['notes-circle'] })[0];
  if (note) showNotePopup(note.properties.nid);
});

map.on('dblclick', (event) => {
  if (!isMeasuring()) return;
  event.preventDefault();
  finishMeasure();
});

map.on('mousemove', (event) => {
  if (isMeasuring() && state.measure.points.length && !state.measure.done) {
    state.measure.cursor = [event.lngLat.lng, event.lngLat.lat];
    updateMeasureSource();
    renderReadout();
    return;
  }
  if (state.tool !== 'pan') return;
  const layers = state.project ? ['notes-circle'] : ['projects-circle', 'projects-label', 'projects-halo'];
  const hit = map.queryRenderedFeatures(event.point, { layers }).length > 0;
  map.getCanvas().style.cursor = hit ? 'pointer' : '';
});

map.on('moveend', () => updateHash());

/* ------------------------------------------------------------------ démarrage */

const initialView = parseHash();

// On démarre dès que le style est prêt, sans attendre toutes les tuiles : sur une connexion lente,
// le panneau et les outils s'affichent tout de suite et les images arrivent ensuite.
async function start() {
  map.resize();
  updateMapPadding();
  showImagery(map, LATEST_IMAGERY);
  const initial = initialView;
  if (initial?.project && PROJECTS.some((p) => p.id === initial.project)) {
    state.restoring = true;
    await openProject(initial.project, { view: initial });
    // Si l'utilisateur a déjà choisi un autre projet pendant le chargement, on n'applique plus le lien.
    const stillHere = () => state.project?.id === initial.project;
    if (stillHere() && initial.modes.includes('3d')) {
      state.view3d = true;
      map.setTerrain({ source: 'dem-terrain', exaggeration: EXAGGERATION });
      map.setPaintProperty('buildings', 'fill-extrusion-height', ['get', 'h']);
    }
    if (stillHere() && initial.modes.includes('inondation') && state.project.flood) {
      if (Number.isFinite(initial.level) && initial.level > 0) state.floodLevel = initial.level;
      setFlood(true);
    }
    if (stillHere() && initial.modes.includes('comparer')) {
      if (state.project.imagery.some((i) => i.date === initial.before)) state.compareDate = initial.before;
      await enterCompare();
      if (stillHere() && state.compare && initial.camera) map.jumpTo({ ...initial.camera, pitch: 0 });
    }
    state.restoring = false;
  } else {
    openHome({ fly: false });
    if (initial?.camera) map.jumpTo(initial.camera);
    else moveCamera({ center: HOME.center, zoom: HOME.zoom }, 1600);
  }
  state.ready = true;
  updateToolbar();
  updateHash();
}

if (map.isStyleLoaded()) start();
else map.once('style.load', start);
