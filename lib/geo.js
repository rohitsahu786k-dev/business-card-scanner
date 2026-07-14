// Offline geocoding for Indian cities/states — no external API, no key, works
// under the artifact/CSP model. Covers the metros + major industrial hubs that
// dominate an Indian expo; falls back to state centroid, then country centroid.

import { DOODLE_AFFINE } from '@/lib/india-map';

// [lat, lng]
const CITY_COORDS = {
  mumbai: [19.08, 72.88], 'navi mumbai': [19.03, 73.02], thane: [19.22, 72.98], pune: [18.52, 73.86],
  nagpur: [21.15, 79.09], nashik: [19.99, 73.79], aurangabad: [19.88, 75.34], kolhapur: [16.70, 74.24],
  delhi: [28.61, 77.21], 'new delhi': [28.61, 77.21], noida: [28.54, 77.39], 'greater noida': [28.47, 77.50],
  gurgaon: [28.46, 77.03], gurugram: [28.46, 77.03], faridabad: [28.41, 77.31], ghaziabad: [28.67, 77.45],
  ahmedabad: [23.02, 72.57], surat: [21.17, 72.83], vadodara: [22.31, 73.18], rajkot: [22.30, 70.80],
  gandhinagar: [23.22, 72.65], jamnagar: [22.47, 70.06], bharuch: [21.71, 72.99], ankleshwar: [21.63, 73.00],
  vapi: [20.37, 72.90], mundra: [22.84, 69.72], hazira: [21.11, 72.62],
  bangalore: [12.97, 77.59], bengaluru: [12.97, 77.59], mysore: [12.30, 76.64], mysuru: [12.30, 76.64],
  hubli: [15.36, 75.12], belgaum: [15.85, 74.50], mangalore: [12.91, 74.86],
  chennai: [13.08, 80.27], coimbatore: [11.02, 76.96], madurai: [9.93, 78.12], trichy: [10.79, 78.70],
  hosur: [12.74, 77.83], salem: [11.66, 78.15], tirupur: [11.11, 77.34],
  hyderabad: [17.39, 78.49], secunderabad: [17.44, 78.50], visakhapatnam: [17.69, 83.22], vizag: [17.69, 83.22],
  vijayawada: [16.51, 80.65], warangal: [17.97, 79.59],
  kolkata: [22.57, 88.36], howrah: [22.59, 88.31], durgapur: [23.55, 87.29], asansol: [23.68, 86.98],
  haldia: [22.06, 88.11], kharagpur: [22.35, 87.32],
  jaipur: [26.91, 75.79], jodhpur: [26.24, 73.02], udaipur: [24.58, 73.71], kota: [25.21, 75.86],
  bhiwadi: [28.21, 76.86], ajmer: [26.47, 74.64],
  lucknow: [26.85, 80.95], kanpur: [26.45, 80.33], agra: [27.18, 78.01], varanasi: [25.32, 82.97],
  meerut: [28.98, 77.71], allahabad: [25.44, 81.85], prayagraj: [25.44, 81.85],
  indore: [22.72, 75.86], bhopal: [23.26, 77.41], gwalior: [26.22, 78.18], jabalpur: [23.18, 79.99],
  pithampur: [22.61, 75.68], ujjain: [23.18, 75.78],
  chandigarh: [30.73, 76.78], ludhiana: [30.90, 75.86], amritsar: [31.63, 74.87], jalandhar: [31.33, 75.58],
  mohali: [30.70, 76.72], panchkula: [30.69, 76.86],
  kochi: [9.93, 76.27], cochin: [9.93, 76.27], trivandrum: [8.52, 76.94], thiruvananthapuram: [8.52, 76.94],
  kozhikode: [11.26, 75.78], thrissur: [10.53, 76.21],
  bhubaneswar: [20.30, 85.82], cuttack: [20.46, 85.88], rourkela: [22.26, 84.85],
  patna: [25.59, 85.14], jamshedpur: [22.80, 86.20], ranchi: [23.34, 85.31], dhanbad: [23.80, 86.43],
  bokaro: [23.67, 86.15],
  raipur: [21.25, 81.63], bhilai: [21.19, 81.38], bilaspur: [22.08, 82.15], korba: [22.35, 82.68],
  guwahati: [26.14, 91.74], dehradun: [30.32, 78.03], haridwar: [29.95, 78.16], rudrapur: [28.98, 79.40],
  haldwani: [29.22, 79.51], silvassa: [20.27, 73.01], daman: [20.40, 72.83], panaji: [15.49, 73.83],
  goa: [15.49, 73.83], jammu: [32.73, 74.87], srinagar: [34.08, 74.80], shimla: [31.10, 77.17],
  baddi: [30.96, 76.79], solan: [30.91, 77.10], siliguri: [26.73, 88.40],
};

// State / UT centroids.
const STATE_COORDS = {
  maharashtra: [19.75, 75.71], gujarat: [22.66, 71.16], karnataka: [15.32, 75.71],
  'tamil nadu': [11.13, 78.66], telangana: [17.91, 79.09], 'andhra pradesh': [15.91, 79.74],
  'west bengal': [22.99, 87.86], rajasthan: [27.02, 74.22], 'uttar pradesh': [26.85, 80.95],
  'madhya pradesh': [23.47, 77.95], punjab: [31.15, 75.34], kerala: [10.85, 76.27],
  odisha: [20.95, 85.10], bihar: [25.10, 85.31], jharkhand: [23.61, 85.28],
  chhattisgarh: [21.28, 81.87], assam: [26.20, 92.94], uttarakhand: [30.07, 79.11],
  'himachal pradesh': [31.10, 77.17], haryana: [29.06, 76.09], delhi: [28.61, 77.21],
  goa: [15.49, 73.83], 'jammu and kashmir': [33.28, 75.34], chandigarh: [30.73, 76.78],
  'dadra and nagar haveli': [20.27, 73.01], puducherry: [11.94, 79.81], tripura: [23.83, 91.28],
  meghalaya: [25.47, 91.37], manipur: [24.66, 93.91], nagaland: [26.16, 94.56],
  'arunachal pradesh': [28.22, 94.73], mizoram: [23.16, 92.94], sikkim: [27.53, 88.51],
};

const INDIA_CENTROID = [22.5, 79.0];

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Returns { lat, lng, level } or null.
export function resolveCoordinates(city, state, country) {
  const c = norm(city);
  if (c && CITY_COORDS[c]) return { lat: CITY_COORDS[c][0], lng: CITY_COORDS[c][1], level: 'city' };
  const s = norm(state);
  if (s && STATE_COORDS[s]) return { lat: STATE_COORDS[s][0], lng: STATE_COORDS[s][1], level: 'state' };
  const co = norm(country);
  if (!c && !s && co && co !== 'india') return null; // non-India, unknown → unmapped
  if (c || s || co === 'india') return { lat: INDIA_CENTROID[0], lng: INDIA_CENTROID[1], level: 'country' };
  return null;
}

// Which state each known city sits in. Lets a contact that only has a city still
// be placed on the map, and keeps city rows grouped under the right state.
const CITY_STATE = {
  mumbai: 'Maharashtra', 'navi mumbai': 'Maharashtra', thane: 'Maharashtra', pune: 'Maharashtra',
  nagpur: 'Maharashtra', nashik: 'Maharashtra', aurangabad: 'Maharashtra', kolhapur: 'Maharashtra',
  delhi: 'Delhi', 'new delhi': 'Delhi',
  noida: 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh', ghaziabad: 'Uttar Pradesh',
  lucknow: 'Uttar Pradesh', kanpur: 'Uttar Pradesh', agra: 'Uttar Pradesh', varanasi: 'Uttar Pradesh',
  meerut: 'Uttar Pradesh', allahabad: 'Uttar Pradesh', prayagraj: 'Uttar Pradesh',
  gurgaon: 'Haryana', gurugram: 'Haryana', faridabad: 'Haryana', panchkula: 'Haryana',
  ahmedabad: 'Gujarat', surat: 'Gujarat', vadodara: 'Gujarat', rajkot: 'Gujarat',
  gandhinagar: 'Gujarat', jamnagar: 'Gujarat', bharuch: 'Gujarat', ankleshwar: 'Gujarat',
  vapi: 'Gujarat', mundra: 'Gujarat', hazira: 'Gujarat',
  bangalore: 'Karnataka', bengaluru: 'Karnataka', mysore: 'Karnataka', mysuru: 'Karnataka',
  hubli: 'Karnataka', belgaum: 'Karnataka', mangalore: 'Karnataka',
  chennai: 'Tamil Nadu', coimbatore: 'Tamil Nadu', madurai: 'Tamil Nadu', trichy: 'Tamil Nadu',
  hosur: 'Tamil Nadu', salem: 'Tamil Nadu', tirupur: 'Tamil Nadu',
  hyderabad: 'Telangana', secunderabad: 'Telangana', warangal: 'Telangana',
  visakhapatnam: 'Andhra Pradesh', vizag: 'Andhra Pradesh', vijayawada: 'Andhra Pradesh',
  kolkata: 'West Bengal', howrah: 'West Bengal', durgapur: 'West Bengal', asansol: 'West Bengal',
  haldia: 'West Bengal', kharagpur: 'West Bengal', siliguri: 'West Bengal',
  jaipur: 'Rajasthan', jodhpur: 'Rajasthan', udaipur: 'Rajasthan', kota: 'Rajasthan',
  bhiwadi: 'Rajasthan', ajmer: 'Rajasthan',
  indore: 'Madhya Pradesh', bhopal: 'Madhya Pradesh', gwalior: 'Madhya Pradesh',
  jabalpur: 'Madhya Pradesh', pithampur: 'Madhya Pradesh', ujjain: 'Madhya Pradesh',
  chandigarh: 'Chandigarh',
  ludhiana: 'Punjab', amritsar: 'Punjab', jalandhar: 'Punjab', mohali: 'Punjab',
  kochi: 'Kerala', cochin: 'Kerala', trivandrum: 'Kerala', thiruvananthapuram: 'Kerala',
  kozhikode: 'Kerala', thrissur: 'Kerala',
  bhubaneswar: 'Odisha', cuttack: 'Odisha', rourkela: 'Odisha',
  patna: 'Bihar',
  jamshedpur: 'Jharkhand', ranchi: 'Jharkhand', dhanbad: 'Jharkhand', bokaro: 'Jharkhand',
  raipur: 'Chhattisgarh', bhilai: 'Chhattisgarh', bilaspur: 'Chhattisgarh', korba: 'Chhattisgarh',
  guwahati: 'Assam',
  dehradun: 'Uttarakhand', haridwar: 'Uttarakhand', rudrapur: 'Uttarakhand', haldwani: 'Uttarakhand',
  silvassa: 'Dadra and Nagar Haveli', daman: 'Dadra and Nagar Haveli',
  panaji: 'Goa', goa: 'Goa',
  jammu: 'Jammu and Kashmir', srinagar: 'Jammu and Kashmir',
  shimla: 'Himachal Pradesh', baddi: 'Himachal Pradesh', solan: 'Himachal Pradesh',
};

// Canonical spelling for the state names the AI or a card might produce.
const STATE_ALIASES = {
  orissa: 'Odisha', odisha: 'Odisha',
  uttaranchal: 'Uttarakhand', uttarakhand: 'Uttarakhand',
  pondicherry: 'Puducherry', puducherry: 'Puducherry',
  'nct of delhi': 'Delhi', 'new delhi': 'Delhi', delhi: 'Delhi',
  'jammu & kashmir': 'Jammu and Kashmir', 'jammu and kashmir': 'Jammu and Kashmir',
  tamilnadu: 'Tamil Nadu', 'tamil nadu': 'Tamil Nadu',
  // titleCase would capitalise the "and" in these, so spell them out.
  'dadra and nagar haveli': 'Dadra and Nagar Haveli',
  'andaman and nicobar': 'Andaman and Nicobar',
};

const titleCase = (s) => s.replace(/\b\w/g, ch => ch.toUpperCase());

// Which state a contact belongs to, from whatever location fields it has.
// Returns { state, lat, lng } or null when the contact cannot be placed.
export function resolveState(city, state, country) {
  const s = norm(state);
  let name = STATE_ALIASES[s] || (s && STATE_COORDS[s] ? titleCase(s) : '');

  if (!name) {
    const c = norm(city);
    if (c && CITY_STATE[c]) name = CITY_STATE[c];
  }
  if (!name) return null;

  const coords = STATE_COORDS[norm(name)];
  if (!coords) return null;

  // Only India is drawn, so an explicitly foreign contact is not placed.
  const co = norm(country);
  if (co && co !== 'india') return null;

  return { state: name, lat: coords[0], lng: coords[1] };
}

// ---------------------------------------------------------------------------
// Placing data on the doodle map
//
// The base map (lib/india-map.js) is a hand-drawn doodle, not a projection. It
// is traced closely enough that a least-squares affine fit lands *interior*
// points — like a state's centroid — reliably inside the right region, but the
// artist's coastline wanders by up to ~150 km, so a point *on* the coast (a city
// like Mumbai) can end up visibly inland.
//
// That is why the map plots one bubble per STATE, at the state's centroid, and
// leaves city-level counts to the tooltip and the ranked list beside it. Do not
// switch this to per-city bubbles without replacing the artwork with a true
// projection — coastal cities will not sit on the coast.
// ---------------------------------------------------------------------------
export function projectOnDoodle(lat, lng) {
  const { a, b, c, e, f, g } = DOODLE_AFFINE;
  return { x: a * lng + b * lat + c, y: e * lng + f * lat + g };
}
