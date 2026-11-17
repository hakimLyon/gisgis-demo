// Configuration des projets de la démo.
// Les lieux, les images et les bâtiments sont réels (sources ouvertes, voir SOURCES) ;
// les projets, plans, notes, statuts et auteurs sont fictifs.

export const WAYBACK_TILES = (release) =>
  `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${release}/{z}/{y}/{x}`;
export const LATEST_RELEASE = 43291;
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const ATTRIBUTION = {
  esri: 'Imagerie © Esri, Maxar, Vantor, Earthstar Geographics',
  osm: '© contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
  dem: 'Relief : AWS Terrain Tiles (SRTM)',
  drone: 'Orthophoto drone : WeRobotics, CC BY 4.0 (OpenAerialMap)',
};

export const HOME = {
  center: [-17.285, 14.752],
  zoom: 10.9,
  title: 'Projets',
  intro: 'Chaque projet rassemble l\'imagerie du site, les plans et les observations de terrain sur une seule carte que toute l\'équipe peut consulter.',
};

export const CATEGORIES = {
  risque: { label: 'Risque', color: '#d8432f' },
  contrainte: { label: 'Contrainte', color: '#e3901f' },
  avancement: { label: 'Avancement', color: '#24a06b' },
  information: { label: 'Information', color: '#7458d6' },
};

export const PROJECTS = [
  {
    id: 'gounass',
    name: 'Médina Gounass',
    subtitle: 'Gestion des eaux pluviales',
    place: 'Guédiawaye, région de Dakar',
    status: 'Études préliminaires',
    summary: 'Étude d\'un bassin de rétention et d\'un collecteur pour réduire les inondations d\'hivernage dans le quartier.',
    marker: [-17.3822, 14.7712],
    camera: { center: [-17.3826, 14.7706], zoom: 15.9, bearing: 0, pitch: 0 },
    studyArea: [-17.392, 14.764, -17.372, 14.779],
    // maxzoom : au-delà, les archives Esri mélangent d'autres dates ; la carte agrandit alors la dernière tuile fiable.
    imagery: [
      { date: '2011-03-25', release: 23383, maxzoom: 17 },
      { date: '2018-10-23', release: 4756, tag: 'fin d\'hivernage' },
      { date: '2020-01-13', release: 20753, tag: 'saison sèche' },
      { date: '2020-10-18', release: 26083, tag: 'après les pluies' },
      { date: '2022-10-23', release: 17632, tag: 'fin d\'hivernage' },
      { date: '2024-01-10', release: 20337 },
      { date: '2026-05-19', release: 43291, tag: 'la plus récente' },
    ],
    defaultDate: '2026-05-19',
    comparePreset: { before: '2020-01-13', after: '2020-10-18' },
    // Tuiles servies par le serveur TiTiler de HOT : l'adresse OpenAerialMap redirige sans en-tête CORS.
    drone: {
      dates: '25 et 26 avril 2017',
      resolution: '2,5 cm par pixel',
      images: [
        {
          id: 'mairie',
          tiles: 'https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?url=https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/5a00a35831eff4000c380570/0/b87bbaed-f735-4c31-a84d-0bc86a6055fe.tif&nodata=0',
          bounds: [-17.384146, 14.768079, -17.379659, 14.772567],
        },
        {
          id: 'gouye-salam',
          tiles: 'https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?url=https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/5a00a4f331eff4000c380572/0/feaab57e-98e0-46ec-8ca8-19d07d9ef618.tif&nodata=0',
          bounds: [-17.379765, 14.769408, -17.377838, 14.771495],
        },
        {
          id: 'terrain',
          tiles: 'https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?url=https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/5a00a3ec31eff4000c380571/0/2422cba3-8cc2-485b-a004-5dace640314a.tif&nodata=0',
          bounds: [-17.388188, 14.768073, -17.386641, 14.769641],
        },
      ],
    },
    buildingsUrl: 'data/gounass-batiments.geojson',
    hypsometryUrl: 'data/gounass-hypsometrie.json',
    flood: { min: 2, max: 20, initial: 8 },
    layers: [
      { id: 'drone', name: 'Orthophoto drone', meta: '25 et 26 avril 2017, 2,5 cm par pixel', on: true, swatch: 'drone', opacity: true },
      { id: 'plan', name: 'Plan du projet', meta: 'Bassin, collecteurs et surverse projetés', on: true, swatch: 'plan' },
      { id: 'buildings', name: 'Bâtiments', meta: 'OpenStreetMap', on: false, swatch: 'buildings' },
      { id: 'study', name: 'Zone d\'étude', meta: '', on: true, swatch: 'study' },
      { id: 'notes', name: 'Notes de l\'équipe', meta: '', on: true, swatch: 'notes' },
      { id: 'labels', name: 'Noms des rues et quartiers', meta: 'OpenStreetMap', on: true, swatch: 'labels' },
    ],
    planUrl: 'data/gounass-plan.geojson',
    notes: [
      {
        id: 'g1', category: 'risque', lngLat: [-17.38494, 14.76506], date: '2026-09-18',
        title: 'Point bas : l\'eau stagne après les fortes pluies',
        text: 'Secteur le plus bas de la zone d\'étude : 49 bâtiments sont à moins de 6,5 m d\'altitude. Les riverains signalent de l\'eau dans les cours pendant plusieurs semaines.',
        author: 'Chargée d\'études hydrauliques',
      },
      {
        id: 'g2', category: 'information', lngLat: [-17.38142, 14.7715], date: '2026-09-30',
        title: 'Orthophoto drone disponible autour de la mairie',
        text: 'Image à 2,5 cm par pixel : on y repère les caniveaux et les regards existants. Zoomez pour la comparer à l\'image satellite.',
        author: 'Chef de projet',
      },
      {
        id: 'g3', category: 'contrainte', lngLat: [-17.382657, 14.767706], date: '2026-10-02',
        title: 'Conduite d\'eau potable à localiser',
        text: 'Le concessionnaire signale une conduite sous cette rue. Sondages à faire avant d\'ouvrir la tranchée du collecteur sud.',
        author: 'Topographe',
      },
      {
        id: 'g4', category: 'information', lngLat: [-17.38424, 14.770376], date: '2026-10-05',
        title: 'Bassin n° 1 : capacité à vérifier',
        text: 'La surverse du projet s\'y déverse en cas de trop-plein. Un curage est à programmer avant le raccordement.',
        author: 'Chargée d\'études hydrauliques',
      },
      {
        id: 'g5', category: 'contrainte', lngLat: [-17.380862, 14.770598], date: '2026-10-12',
        title: 'Rue étroite : accès des engins limité',
        text: 'Environ 5 m entre les façades. Prévoir une mini-pelle et une circulation alternée pendant les travaux.',
        author: 'Conducteur de travaux',
      },
      {
        id: 'g6', category: 'avancement', lngLat: [-17.381784, 14.769268], date: '2026-10-22',
        title: 'Levé topographique du bassin terminé',
        text: 'Emprise levée le 21 octobre. Le relief confirme que la friche est le point bas du secteur ; le modèle 3D est en cours de traitement.',
        author: 'Topographe',
      },
    ],
  },
  {
    id: 'diamniadio',
    name: 'Stade de Diamniadio',
    subtitle: 'Suivi de chantier',
    place: 'Diamniadio, région de Dakar',
    status: 'Exemple de suivi, de 2020 à 2026',
    summary: 'Suivre l\'avancement d\'un grand chantier image par image : le stade Abdoulaye Wade, du terrain nu à aujourd\'hui.',
    marker: [-17.2015, 14.7328],
    camera: { center: [-17.2015, 14.7326], zoom: 16.4, bearing: 0, pitch: 0 },
    imagery: [
      { date: '2011-03-25', release: 18966, maxzoom: 17 },
      { date: '2017-03-21', release: 119, maxzoom: 17 },
      { date: '2020-01-28', release: 27659, maxzoom: 17, tag: 'avant travaux' },
      { date: '2021-04-01', release: 44988, tag: 'chantier' },
      { date: '2022-03-25', release: 17632, tag: 'livré' },
      { date: '2024-01-10', release: 20337 },
      { date: '2025-09-20', release: 26334 },
      { date: '2026-05-12', release: 43291, tag: 'la plus récente' },
    ],
    defaultDate: '2026-05-12',
    comparePreset: { before: '2020-01-28', after: '2022-03-25' },
    footprintUrl: 'data/diamniadio-stade.geojson',
    layers: [
      { id: 'footprint', name: 'Emprise du stade', meta: 'OpenStreetMap', on: true, swatch: 'plan' },
      { id: 'notes', name: 'Notes de l\'équipe', meta: '', on: true, swatch: 'notes' },
      { id: 'labels', name: 'Noms des rues et quartiers', meta: 'OpenStreetMap', on: true, swatch: 'labels' },
    ],
    notes: [
      {
        id: 'd1', category: 'avancement', lngLat: [-17.2008, 14.7314], date: '2020-02-04',
        title: 'Janvier 2020 : terrain encore nu',
        text: 'Image du 28 janvier 2020 : seules des pistes d\'accès sont tracées sur l\'emprise. Comparez avec mars 2022 pour voir tout le chantier.',
        author: 'Mission de suivi',
      },
      {
        id: 'd2', category: 'information', lngLat: [-17.2027, 14.7328], date: '2021-04-12',
        title: 'Zone de stockage et installations de chantier',
        text: 'Sur l\'image d\'avril 2021, matériaux et bungalows occupent l\'ouest de l\'emprise. Ils laissent place aux parkings ombragés en 2022.',
        author: 'Mission de suivi',
      },
      {
        id: 'd3', category: 'avancement', lngLat: [-17.2003, 14.7331], date: '2021-04-12',
        title: 'Avril 2021 : tribunes en gros œuvre',
        text: 'La structure des tribunes fait le tour du terrain ; la charpente du toit est en cours de pose et la pelouse n\'est pas encore installée.',
        author: 'Mission de suivi',
      },
      {
        id: 'd4', category: 'avancement', lngLat: [-17.2014, 14.7338], date: '2022-03-30',
        title: 'Mars 2022 : stade livré',
        text: 'Toiture terminée, pelouse posée, parkings aménagés. Le stade a été inauguré en février 2022.',
        author: 'Mission de suivi',
      },
      {
        id: 'd5', category: 'information', lngLat: [-17.2021, 14.7313], date: '2026-05-20',
        title: 'Emprise de 11,5 ha',
        text: 'Surface calculée sur le contour OpenStreetMap. L\'outil Surface permet de mesurer n\'importe quelle zone du chantier.',
        author: 'Mission de suivi',
      },
    ],
  },
];

export const SOURCES = [
  {
    title: 'Imagerie satellite',
    text: 'Esri World Imagery et ses archives (Wayback), images Maxar et Vantor. La date affichée est celle de la prise de vue au centre du projet.',
    license: 'Conditions d\'utilisation d\'Esri',
  },
  {
    title: 'Orthophoto drone de Médina Gounass',
    text: 'Vols du 25 et 26 avril 2017 réalisés par WeRobotics, publiés sur OpenAerialMap.',
    license: 'CC BY 4.0',
  },
  {
    title: 'Bâtiments, rues et emprise du stade',
    text: 'Contributeurs OpenStreetMap, servis par OpenFreeMap. Hauteur des bâtiments estimée à 3,5 m quand elle n\'est pas renseignée.',
    license: 'ODbL',
  },
  {
    title: 'Relief et simulation d\'inondation',
    text: 'AWS Terrain Tiles (Terrarium), issus principalement de la mission SRTM, environ 30 m de résolution.',
    license: 'Données ouvertes, attribution requise',
  },
  {
    title: 'Projets, plans, notes et statuts',
    text: 'Fictifs, créés uniquement pour cette démonstration. Ils ne décrivent aucun projet réel de ces quartiers.',
    license: '',
  },
  {
    title: 'Logiciel',
    text: 'Carte affichée avec MapLibre GL JS 5.24.',
    license: 'BSD 3-Clause',
  },
];
