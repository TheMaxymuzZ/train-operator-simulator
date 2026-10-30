'use strict';

// ---------------------------------------------------------------------------
// Static data: stations, lines, train types and the daily service plan.
// Coordinates are real longitude/latitude; line lengths are derived from them.
// ---------------------------------------------------------------------------

// platforms: tracks with a passenger platform (vías con andén)
// sidings:   tracks without platform, for freight and overtaking (vías de apartado)
// changer:   the station has a gauge changer (cambiador de ancho)
const STATIONS = {
  ACO: { name: 'A Coruña',        lon: -8.41, lat: 43.36, platforms: 3, sidings: 0 },
  OUR: { name: 'Ourense',         lon: -7.86, lat: 42.34, platforms: 3, sidings: 1, changer: true },
  PON: { name: 'Ponferrada',      lon: -6.60, lat: 42.55, platforms: 2, sidings: 1 },
  LEO: { name: 'León',            lon: -5.57, lat: 42.60, platforms: 3, sidings: 1, changer: true },
  VLL: { name: 'Valladolid',      lon: -4.72, lat: 41.65, platforms: 4, sidings: 2, changer: true },
  BUR: { name: 'Burgos',          lon: -3.70, lat: 42.34, platforms: 3, sidings: 1 },
  MIR: { name: 'Miranda de Ebro', lon: -2.95, lat: 42.68, platforms: 3, sidings: 2 },
  BIL: { name: 'Bilbao',          lon: -2.93, lat: 43.26, platforms: 3, sidings: 0 },
  TUD: { name: 'Tudela',          lon: -1.61, lat: 42.06, platforms: 2, sidings: 1 },
  LOG: { name: 'Logroño',         lon: -2.45, lat: 42.47, platforms: 3, sidings: 1 },
  ZGZ: { name: 'Zaragoza',        lon: -0.88, lat: 41.65, platforms: 4, sidings: 2, changer: true },
  LLE: { name: 'Lleida',          lon:  0.62, lat: 41.62, platforms: 3, sidings: 1 },
  TGN: { name: 'Tarragona',       lon:  1.25, lat: 41.12, platforms: 4, sidings: 1 },
  BCN: { name: 'Barcelona',       lon:  2.17, lat: 41.38, platforms: 6, sidings: 0 },
  VIN: { name: 'Vinaròs',         lon:  0.47, lat: 40.47, platforms: 2, sidings: 1 },
  CAS: { name: 'Castellón',       lon: -0.04, lat: 39.99, platforms: 2, sidings: 1 },
  VAL: { name: 'Valencia',        lon: -0.38, lat: 39.47, platforms: 4, sidings: 1 },
  ALB: { name: 'Albacete',        lon: -1.86, lat: 38.99, platforms: 3, sidings: 1 },
  ALI: { name: 'Alicante',        lon: -0.49, lat: 38.35, platforms: 3, sidings: 0 },
  MAD: { name: 'Madrid',          lon: -3.69, lat: 40.41, platforms: 8, sidings: 0 },
  GUA: { name: 'Guadalajara',     lon: -3.17, lat: 40.63, platforms: 2, sidings: 1 },
  CAL: { name: 'Calatayud',       lon: -1.64, lat: 41.35, platforms: 2, sidings: 1 },
  SEG: { name: 'Segovia',         lon: -4.12, lat: 40.95, platforms: 2, sidings: 1 },
  CUE: { name: 'Cuenca',          lon: -2.13, lat: 40.07, platforms: 2, sidings: 1 },
  REQ: { name: 'Requena',         lon: -1.10, lat: 39.49, platforms: 2, sidings: 1 },
  PUE: { name: 'Puertollano',     lon: -4.11, lat: 38.69, platforms: 2, sidings: 1 },
  ANT: { name: 'Antequera',       lon: -4.56, lat: 37.02, platforms: 2, sidings: 1 },
  CRE: { name: 'Ciudad Real',     lon: -3.93, lat: 38.99, platforms: 2, sidings: 1 },
  COR: { name: 'Córdoba',         lon: -4.78, lat: 37.89, platforms: 4, sidings: 1 },
  SEV: { name: 'Sevilla',         lon: -5.98, lat: 37.39, platforms: 4, sidings: 0 },
  MAL: { name: 'Málaga',          lon: -4.42, lat: 36.72, platforms: 3, sidings: 0 },
};

// [from, to, tracks (1 = vía única, 2 = doble vía), line speed km/h, gauge]
// gauge: 'U' ancho estándar (UIC), 'I' ancho ibérico, 'M' ancho mixto (tercer carril)
const LINES = [
  ['MAD', 'GUA', 2, 300, 'U'], ['GUA', 'CAL', 2, 300, 'U'], ['CAL', 'ZGZ', 2, 300, 'U'],
  ['ZGZ', 'LLE', 2, 300, 'M'], ['LLE', 'TGN', 2, 300, 'M'], ['TGN', 'BCN', 2, 250, 'M'],
  ['MAD', 'CRE', 2, 300, 'U'], ['CRE', 'PUE', 2, 300, 'U'], ['PUE', 'COR', 2, 300, 'U'],
  ['COR', 'SEV', 2, 250, 'U'], ['COR', 'ANT', 2, 300, 'U'], ['ANT', 'MAL', 2, 300, 'U'],
  ['MAD', 'CUE', 2, 300, 'U'], ['CUE', 'REQ', 2, 300, 'U'], ['REQ', 'VAL', 2, 250, 'U'],
  ['CUE', 'ALB', 2, 300, 'U'], ['ALB', 'ALI', 2, 300, 'U'],
  ['MAD', 'SEG', 2, 300, 'U'], ['SEG', 'VLL', 2, 300, 'U'], ['VLL', 'LEO', 2, 250, 'U'],
  ['LEO', 'PON', 1, 160, 'I'], ['PON', 'OUR', 1, 160, 'I'], ['OUR', 'ACO', 2, 250, 'U'],
  ['VLL', 'BUR', 1, 160, 'I'], ['BUR', 'MIR', 1, 160, 'I'], ['MIR', 'BIL', 1, 140, 'I'],
  ['ZGZ', 'TUD', 1, 160, 'I'], ['TUD', 'LOG', 1, 160, 'I'], ['LOG', 'MIR', 1, 160, 'I'],
  ['VAL', 'CAS', 2, 200, 'I'], ['CAS', 'VIN', 2, 200, 'I'], ['VIN', 'TGN', 2, 200, 'I'],
];

const GAUGES = {
  U: { name: 'ancho estándar', color: '#2f5068' },
  I: { name: 'ancho ibérico',  color: '#5d5a52' },
  M: { name: 'ancho mixto',    color: '#3f5a5c' },
};

// gauge: 'U' only standard, 'I' only Iberian, 'D' dual (changes at a gauge
// changer), 'auto' takes whatever single gauge its route allows.
const TYPES = {
  AV:  { name: 'Alta velocidad',  vmax: 300, acc: 0.45, dwell: 120, pax: true,  gauge: 'U',    color: '#5fd4ff' },
  LD:  { name: 'Larga distancia', vmax: 200, acc: 0.40, dwell: 120, pax: true,  gauge: 'D',    color: '#c792ff' },
  MD:  { name: 'Media distancia', vmax: 160, acc: 0.50, dwell: 60,  pax: true,  gauge: 'auto', color: '#4cf3a0' },
  MER: { name: 'Mercancías',      vmax: 100, acc: 0.20, dwell: 0,   pax: false, gauge: 'I',    color: '#ffb547' },
};

// Daily plan. Each pattern runs in both directions between first and last
// departure, every `every` minutes. `stops` defaults to every station.
const PATTERNS = [
  { type: 'AV',  route: ['MAD', 'GUA', 'CAL', 'ZGZ', 'LLE', 'TGN', 'BCN'], stops: ['MAD', 'ZGZ', 'TGN', 'BCN'], first: '06:30', last: '20:30', every: 60 },
  { type: 'AV',  route: ['MAD', 'CRE', 'PUE', 'COR', 'SEV'], stops: ['MAD', 'COR', 'SEV'], first: '07:00', last: '21:00', every: 60 },
  { type: 'AV',  route: ['MAD', 'CRE', 'PUE', 'COR', 'ANT', 'MAL'], stops: ['MAD', 'CRE', 'COR', 'ANT', 'MAL'], first: '07:40', last: '19:40', every: 120 },
  { type: 'AV',  route: ['MAD', 'CUE', 'REQ', 'VAL'], stops: ['MAD', 'CUE', 'VAL'], first: '06:45', last: '20:15', every: 90 },
  { type: 'AV',  route: ['MAD', 'CUE', 'ALB', 'ALI'], first: '07:15', last: '19:15', every: 120 },
  { type: 'LD',  route: ['MAD', 'SEG', 'VLL', 'LEO', 'PON', 'OUR', 'ACO'], first: '07:05', last: '19:05', every: 180 },
  { type: 'LD',  route: ['MAD', 'SEG', 'VLL', 'BUR', 'MIR', 'BIL'], first: '08:10', last: '20:10', every: 180 },
  { type: 'LD',  route: ['BCN', 'TGN', 'LLE', 'ZGZ', 'TUD', 'LOG', 'MIR', 'BIL'], first: '07:30', last: '19:30', every: 240 },
  { type: 'LD',  route: ['VAL', 'CAS', 'VIN', 'TGN', 'BCN'], first: '06:35', last: '20:35', every: 120 },
  { type: 'MD',  route: ['SEV', 'COR', 'ANT', 'MAL'], first: '07:20', last: '21:20', every: 120 },
  { type: 'MD',  route: ['VLL', 'LEO'], first: '06:50', last: '20:50', every: 120 },
  { type: 'MD',  route: ['ZGZ', 'LLE'], first: '07:10', last: '21:10', every: 120 },
  { type: 'MD',  route: ['MAD', 'GUA', 'CAL'], first: '06:40', last: '21:40', every: 120 },
  { type: 'MD',  route: ['MAD', 'CRE', 'PUE'], first: '06:55', last: '20:55', every: 120 },
  { type: 'MD',  route: ['BUR', 'MIR', 'BIL'], first: '07:45', last: '19:45', every: 240 },
  { type: 'MER', route: ['VAL', 'CAS', 'VIN', 'TGN', 'LLE', 'ZGZ'], first: '06:20', last: '20:20', every: 240 },
  { type: 'MER', route: ['VAL', 'CAS', 'VIN', 'TGN', 'BCN'], first: '06:10', last: '20:10', every: 240 },
  { type: 'MER', route: ['BIL', 'MIR', 'LOG', 'TUD', 'ZGZ'], first: '06:50', last: '18:50', every: 300 },
  { type: 'MER', route: ['BIL', 'MIR', 'BUR', 'VLL'], first: '08:20', last: '18:20', every: 300 },
];

// Corridors available in the train graph (time-distance diagram).
const CORRIDORS = {
  'Madrid – Barcelona':   ['MAD', 'GUA', 'CAL', 'ZGZ', 'LLE', 'TGN', 'BCN'],
  'Madrid – Sevilla':     ['MAD', 'CRE', 'PUE', 'COR', 'SEV'],
  'Madrid – Málaga':      ['MAD', 'CRE', 'PUE', 'COR', 'ANT', 'MAL'],
  'Madrid – Valencia':    ['MAD', 'CUE', 'REQ', 'VAL'],
  'Madrid – Alicante':    ['MAD', 'CUE', 'ALB', 'ALI'],
  'Madrid – A Coruña':    ['MAD', 'SEG', 'VLL', 'LEO', 'PON', 'OUR', 'ACO'],
  'Madrid – Bilbao':      ['MAD', 'SEG', 'VLL', 'BUR', 'MIR', 'BIL'],
  'Bilbao – Zaragoza':    ['BIL', 'MIR', 'LOG', 'TUD', 'ZGZ'],
  'Valencia – Barcelona': ['VAL', 'CAS', 'VIN', 'TGN', 'BCN'],
};

// Camera presets (lon/lat bounding boxes).
const SECTORS = {
  'ESPAÑA':   [-9.4, 36.0, 3.4, 43.8],
  'CENTRO':   [-5.4, 38.6, -1.4, 42.0],
  'NOROESTE': [-9.0, 41.3, -4.2, 43.6],
  'NORTE':    [-5.2, 41.3, -1.9, 43.5],
  'NORESTE':  [-1.6, 40.2, 2.6, 42.9],
  'LEVANTE':  [-2.3, 38.0, 1.6, 41.4],
  'SUR':      [-6.6, 36.5, -3.4, 39.3],
};

// --- Geography (only for orientation on the screen) ---------------------------
// Hand-traced at roughly 0.1-0.3 degrees; [lon, lat] pairs.

// Border with Portugal, from the Guadiana mouth north to the Miño mouth.
const PT_BORDER = [
  [-7.40, 37.18], [-7.42, 37.50], [-7.50, 37.80], [-7.25, 38.20], [-7.30, 38.45], [-7.05, 38.85],
  [-7.00, 39.10], [-7.30, 39.45], [-7.50, 39.66], [-7.00, 39.68], [-6.90, 40.25], [-6.85, 40.60],
  [-6.80, 41.00], [-6.40, 41.40], [-6.20, 41.58], [-6.55, 41.67], [-6.55, 41.95], [-7.20, 41.88],
  [-7.90, 41.86], [-8.20, 42.05], [-8.65, 42.05], [-8.87, 41.87],
];
// Border with France and Andorra, west to east.
const FR_BORDER = [
  [-1.79, 43.38], [-1.60, 43.25], [-1.40, 43.05], [-1.00, 42.98], [-0.70, 42.85], [-0.30, 42.83],
  [0.00, 42.70], [0.65, 42.85], [0.85, 42.80], [1.40, 42.60], [1.72, 42.50], [2.10, 42.42],
  [2.65, 42.35], [3.17, 42.43],
];

// Mainland Spain, clockwise from the Miño mouth.
const OUTLINE = [
  [-8.87, 41.87], [-8.90, 42.12], [-8.82, 42.28], [-8.95, 42.45], [-9.05, 42.58], [-9.27, 42.88],
  [-9.20, 43.15], [-8.95, 43.30], [-8.40, 43.37], [-8.25, 43.55], [-7.69, 43.79], [-7.30, 43.62],
  [-7.00, 43.55], [-6.30, 43.57], [-5.85, 43.66], [-5.60, 43.55], [-5.10, 43.48], [-4.50, 43.40],
  [-3.80, 43.47], [-3.40, 43.42], [-3.00, 43.38], [-2.70, 43.42], [-2.20, 43.31],
  ...FR_BORDER,
  [3.32, 42.32], [3.13, 42.10], [3.20, 41.90], [2.80, 41.65], [2.20, 41.38], [1.80, 41.23],
  [1.25, 41.10], [0.90, 40.85], [0.88, 40.70], [0.60, 40.55], [0.30, 40.20], [0.00, 39.95],
  [-0.30, 39.55], [-0.25, 39.20], [-0.05, 38.90], [0.20, 38.73], [-0.05, 38.62], [-0.40, 38.38],
  [-0.65, 38.05], [-0.75, 37.80], [-0.69, 37.63], [-1.00, 37.58], [-1.40, 37.50], [-1.65, 37.37],
  [-1.85, 37.10], [-2.19, 36.72], [-2.45, 36.83], [-2.90, 36.74], [-3.50, 36.72], [-4.42, 36.72],
  [-4.90, 36.50], [-5.35, 36.15], [-5.60, 36.01], [-6.00, 36.18], [-6.30, 36.53], [-6.40, 36.80],
  [-6.85, 37.10],
  ...PT_BORDER,
];

const GEO = {
  // neighbouring land, drawn darker than Spain
  land: [
    [ // Portugal: coast south from the Miño, then the border back north
      [-8.87, 41.87], [-8.80, 41.50], [-8.65, 41.15], [-8.75, 40.65], [-8.90, 40.15], [-9.05, 39.75],
      [-9.35, 39.37], [-9.48, 38.78], [-9.15, 38.65], [-9.20, 38.42], [-8.80, 38.48], [-8.80, 38.00],
      [-8.80, 37.60], [-8.98, 37.02], [-8.60, 37.10], [-7.95, 37.00], ...PT_BORDER,
    ],
    [ // France
      ...FR_BORDER, [3.05, 42.70], [3.10, 43.10], [3.60, 43.40], [4.20, 43.48], [4.80, 43.35],
      [5.40, 43.20], [6.00, 43.10], [7.50, 43.70], [7.50, 46.50], [-1.50, 46.50], [-1.20, 44.60],
      [-1.25, 44.00], [-1.50, 43.50],
    ],
    [ // North Africa
      [-5.92, 35.78], [-5.35, 35.90], [-5.00, 35.50], [-4.40, 35.20], [-3.90, 35.20], [-2.94, 35.29],
      [-2.20, 35.10], [-1.10, 35.20], [-0.60, 35.80], [0.10, 35.90], [1.20, 36.50], [3.00, 36.80],
      [5.00, 36.80], [5.00, 33.50], [-8.00, 33.50], [-6.85, 34.05], [-6.30, 35.00],
    ],
  ],
  // Spanish islands, drawn like the mainland
  islands: [
    [[2.35, 39.60], [2.70, 39.95], [3.20, 39.95], [3.48, 39.72], [3.25, 39.35], [2.95, 39.35], [2.70, 39.53], [2.50, 39.47]],
    [[3.80, 40.05], [4.30, 39.98], [4.25, 39.82], [3.85, 39.93]],
    [[1.20, 38.98], [1.45, 39.10], [1.62, 39.03], [1.40, 38.83], [1.28, 38.87]],
    [[1.38, 38.72], [1.58, 38.68], [1.45, 38.64]],
  ],
  rivers: {
    'Miño':         [[-7.55, 43.10], [-7.56, 42.60], [-7.86, 42.34], [-8.20, 42.12], [-8.87, 41.87]],
    'Duero':        [[-2.85, 41.95], [-3.70, 41.68], [-4.70, 41.53], [-5.75, 41.50], [-6.20, 41.30], [-6.90, 41.10], [-7.80, 41.15], [-8.65, 41.14]],
    'Ebro':         [[-4.10, 43.00], [-3.60, 42.75], [-2.95, 42.62], [-2.45, 42.47], [-1.60, 42.07], [-0.90, 41.65], [-0.20, 41.35], [0.50, 41.20], [0.60, 40.95], [0.88, 40.72]],
    'Tajo':         [[-1.80, 40.60], [-2.60, 40.40], [-3.60, 40.05], [-4.00, 39.86], [-5.00, 39.90], [-6.40, 39.65], [-7.00, 39.67], [-7.90, 39.45], [-8.60, 39.05], [-9.10, 38.70]],
    'Guadiana':     [[-3.30, 39.05], [-3.90, 39.10], [-5.30, 38.95], [-6.35, 38.88], [-6.98, 38.88], [-7.25, 38.60], [-7.50, 38.00], [-7.42, 37.50], [-7.40, 37.18]],
    'Guadalquivir': [[-2.90, 37.95], [-3.80, 38.00], [-4.78, 37.88], [-5.60, 37.65], [-5.99, 37.38], [-6.20, 37.00], [-6.36, 36.79]],
  },
  // [text, lon, lat, kind]
  labels: [
    ['OCÉANO ATLÁNTICO', -10.6, 39.0, 'sea'],
    ['MAR CANTÁBRICO', -5.2, 44.15, 'sea'],
    ['MAR MEDITERRÁNEO', 1.6, 37.7, 'sea'],
    ['MAR DE ALBORÁN', -3.6, 36.2, 'sea'],
    ['ISLAS BALEARES', 2.9, 40.35, 'region'],
    ['PORTUGAL', -8.2, 40.1, 'country'],
    ['FRANCIA', 0.9, 43.65, 'country'],
    ['ANDORRA', 1.55, 42.75, 'region'],
    ['MARRUECOS', -4.8, 34.7, 'country'],
    ['ARGELIA', 1.6, 35.4, 'country'],
  ],
};

// Equirectangular projection centred on Madrid; 1 unit is about 1 km.
const KM_PER_DEG = 111.2;
const COS_LAT = Math.cos(40.2 * Math.PI / 180);
function project(lon, lat) {
  return { x: (lon + 3.7) * COS_LAT * KM_PER_DEG, y: (40.4 - lat) * KM_PER_DEG };
}
