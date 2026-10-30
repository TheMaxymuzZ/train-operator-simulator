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

// Coarse outline of mainland Spain, only for orientation on the screen.
const OUTLINE = [
  [-9.3, 43.0], [-8.9, 43.33], [-8.2, 43.6], [-7.0, 43.55], [-5.8, 43.6], [-4.5, 43.4],
  [-3.5, 43.45], [-2.9, 43.4], [-1.8, 43.38], [-1.4, 43.05], [-0.7, 42.8], [0.7, 42.8],
  [1.5, 42.45], [2.4, 42.4], [3.2, 42.35], [3.2, 41.9], [2.4, 41.45], [1.0, 41.05],
  [0.8, 40.7], [0.2, 40.1], [-0.3, 39.5], [0.2, 38.75], [-0.5, 38.3], [-0.8, 37.6],
  [-1.6, 37.25], [-2.1, 36.75], [-3.0, 36.75], [-4.4, 36.7], [-5.0, 36.45], [-5.6, 36.0],
  [-6.2, 36.4], [-6.4, 36.8], [-7.4, 37.2], [-7.5, 37.6], [-7.0, 38.2], [-7.3, 38.5],
  [-7.0, 39.0], [-7.5, 39.7], [-6.9, 40.25], [-6.8, 40.9], [-6.4, 41.6], [-6.6, 41.95],
  [-7.2, 41.9], [-8.1, 41.85], [-8.9, 41.9], [-8.9, 42.5],
];

// Equirectangular projection centred on Madrid; 1 unit is about 1 km.
const KM_PER_DEG = 111.2;
const COS_LAT = Math.cos(40.2 * Math.PI / 180);
function project(lon, lat) {
  return { x: (lon + 3.7) * COS_LAT * KM_PER_DEG, y: (40.4 - lat) * KM_PER_DEG };
}
