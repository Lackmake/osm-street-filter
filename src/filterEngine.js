/**
 * Standalone OSM Street Filtering Engine
 * Evaluates OpenStreetMap ways against street inclusion/exclusion rules.
 */

export const ALLOWED_FOOT_TAGS = ['yes', 'designated', 'allowed', 'permissive', 'official'];
export const EXCLUDED_FOOT_TAGS = ['no', 'use_sidepath', 'private', 'destination', 'customers'];
export const EXCLUDED_ACCESS_TAGS = ['private', 'customers', 'military', 'destination'];

export const EXCLUDED_HIGHWAYS = [
  'motorway', 'motorway_link', 'steps', 'escalator', 'elevator',
  'construction', 'proposed', 'demolished', 'escape', 'bus_guideway',
  'sidewalk', 'crossing', 'bus_stop', 'traffic_signals', 'stop',
  'give_way', 'milestone', 'platform', 'speed_camera', 'raceway',
  'rest_area', 'traffic_island', 'services', 'yes', 'no', 'drain',
  'street_lamp', 'razed', 'corridor', 'busway', 'cycleway',
];

export const SPECIAL_UNINCLUDED_HIGHWAYS = [
  'footway', 'service', 'trunk', 'trunk_link', 'bridleway'
];

export const UNPAVED_SURFACES = [
  'sett', 'compacted', 'unhewn_cobblestone', 'dirt', 'earth',
  'fine_gravel', 'grass', 'gravel', 'ground', 'mud',
  'pebblestone', 'sand', 'woodchips', 'cobblestone:unhewn'
];

export const HIGHWAY_COLORS = {
  footway: '#f97316',
  pedestrian: '#a855f7',
  residential: '#3b82f6',
  living_street: '#22c55e',
  steps: '#ef4444',
  path: '#eab308',
  cycleway: '#06b6d4',
  track: '#84cc16',
  service: '#6b7280',
  unclassified: '#64748b',
  tertiary: '#8b5cf6',
  secondary: '#ec4899',
  primary: '#f43f5e',
  trunk: '#dc2626',
  bridleway: '#d97706',
  corridor: '#475569',
  road: '#94a3b8',
  motorway: '#991b1b',
  construction: '#78716c',
};

export function getHighwayColor(highway) {
  return HIGHWAY_COLORS[highway] || '#3b82f6';
}

/**
 * Point-in-polygon ray-casting test
 */
export function pointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Test if any point of a line falls inside a polygon
 */
export function lineIntersectsPolygon(lineCoords, polygonCoords) {
  if (!lineCoords || !polygonCoords || polygonCoords.length < 3) return false;
  for (const pt of lineCoords) {
    if (pointInPolygon(pt, polygonCoords)) return true;
  }
  return false;
}

/**
 * Consolidate raw OSM tags into normalized fields.
 */
export function normalizeTags(tags = {}) {
  const swMain = tags.sidewalk;
  const swBoth = tags['sidewalk:both'];
  const swLeft = tags['sidewalk:left'];
  const swRight = tags['sidewalk:right'];
  let sidewalk = null;
  if (swMain === 'separate' || swBoth === 'separate' || swLeft === 'separate' || swRight === 'separate') {
    sidewalk = 'separate';
  } else {
    sidewalk = swMain || swBoth || swLeft || swRight || null;
  }

  return {
    highway: tags.highway || null,
    foot: tags.foot || null,
    footConditional: tags['foot:conditional'] || tags.foot_conditional || null,
    access: tags.access || null,
    sidewalk,
    area: tags.area || null,
    place: tags.place || null,
    bicycle: tags.bicycle || null,
    surface: tags.surface || null,
    footwayTag: tags.footway || tags.footway_tag || null,
    serviceTag: tags.service || tags.service_tag || null,
    motorroad: tags.motorroad || null,
    covered: tags.covered || null,
    indoor: tags.indoor || null,
    tunnel: tags.tunnel || null,
    golfCart: tags.golf_cart || tags.golf_cart_tag || null,
    name: tags.name || null
  };
}

/**
 * Evaluate an OSM street's tags against inclusion/exclusion rules.
 * 
 * @param {Object} rawTags - Key-value pair object of raw OSM way tags
 * @param {Array<Array<Array<number>>>} [naturePolygons] - Optional nature area polygon geometries
 * @param {Array<Array<number>>} [lineCoords] - Optional coordinates of the street LineString
 * @returns {Object} { included: boolean, filter_reason: string, steps: Array }
 */
export function evaluateStreet(rawTags = {}, naturePolygons = [], lineCoords = []) {
  const norm = normalizeTags(rawTags);

  const {
    highway, foot, footConditional, access, sidewalk,
    area, place, bicycle, surface, footwayTag,
    serviceTag, motorroad, covered, indoor, tunnel,
    golfCart, name
  } = norm;

  let included = false;
  let filterReason = null;
  const steps = [];

  function appendReason(action, reasonText) {
    included = (action === 'include');
    const formatted = `${action === 'include' ? 'included' : 'excluded'}: ${reasonText}`;
    if (!filterReason) {
      filterReason = formatted;
    } else {
      filterReason = `${filterReason} -> ${formatted}`;
    }
    steps.push({ action, reason: formatted, raw: reasonText });
  }

  // Step 1: Include by foot tag
  if (ALLOWED_FOOT_TAGS.includes(foot) || Boolean(footConditional)) {
    appendReason('include', `foot=${foot || ''}`);
  }

  // Step 2: Include by highway type
  if (included === false) {
    if (highway && !EXCLUDED_HIGHWAYS.includes(highway) && !SPECIAL_UNINCLUDED_HIGHWAYS.includes(highway)) {
      appendReason('include', `highway=${highway}`);
    }
  }

  // Step 4: Exclude by foot tags
  if (included === true) {
    if (EXCLUDED_FOOT_TAGS.includes(foot)) {
      appendReason('exclude', `foot=${foot}`);
    }
  }

  // Step 4a: Sidewalk rule (Wandrer rule)
  if (included === false && foot === 'use_sidepath' && sidewalk === 'separate') {
    appendReason('include', 'foot=use_sidepath + sidewalk=separate (Wandrer rule)');
  }

  // Step 4c: Pedestrian areas
  if (included === true && highway === 'pedestrian' && area === 'yes') {
    appendReason('exclude', 'pedestrian area (area=yes)');
  }

  // Step 4d: Squares
  if (included === true && place === 'square') {
    appendReason('exclude', 'square (place=square)');
  }

  // Step 5: Bicycle
  if (included === true && bicycle === 'use_sidepath') {
    appendReason('exclude', 'bicycle=use_sidepath');
  }

  // Step 6: Access (Strictly excluding private/customers/military/destination and access=no when foot not allowed)
  if (included === true) {
    if (EXCLUDED_ACCESS_TAGS.includes(access)) {
      appendReason('exclude', `access=${access}`);
    } else if (access === 'no' && !ALLOWED_FOOT_TAGS.includes(foot) && !footConditional) {
      appendReason('exclude', 'access=no');
    }
  }

  // Step 7: Highway types (trunk/bridleway/service without foot tag)
  if (included === true) {
    if (['trunk', 'trunk_link', 'bridleway'].includes(highway) && !ALLOWED_FOOT_TAGS.includes(foot)) {
      appendReason('exclude', `${highway} without foot tag`);
    } else if (highway === 'service' && !ALLOWED_FOOT_TAGS.includes(foot)) {
      appendReason('exclude', 'service road without foot tag');
    }
  }

  // Step 8: Footway in nature/park area
  if (included === false && ['footway', 'steps'].includes(highway)) {
    if ((!foot || !EXCLUDED_FOOT_TAGS.includes(foot)) &&
        (!access || !['private', 'customers', 'military', 'destination', 'no'].includes(access)) &&
        (!footwayTag || !['crossing', 'sidewalk'].includes(footwayTag))) {
      
      let inNatureArea = false;
      if (naturePolygons && naturePolygons.length && lineCoords && lineCoords.length) {
        for (const poly of naturePolygons) {
          if (lineIntersectsPolygon(lineCoords, poly)) {
            inNatureArea = true;
            break;
          }
        }
      }

      if (inNatureArea) {
        appendReason('include', `${highway} in nature/park area`);
      }
    }
  }

  // Step 8b: Unpaved footways
  if (included === false && ['footway', 'path', 'track', 'steps'].includes(highway)) {
    if (UNPAVED_SURFACES.includes(surface)) {
      if ((!foot || !EXCLUDED_FOOT_TAGS.includes(foot)) &&
          (!access || !['private', 'customers', 'military', 'destination', 'no'].includes(access)) &&
          (!footwayTag || footwayTag !== 'sidewalk')) {
        appendReason('include', `unpaved (surface=${surface})`);
      }
    }
  }

  // Step 8c: Footway with bicycle=yes/designated
  if (included === false && highway === 'footway') {
    if (['yes', 'designated'].includes(bicycle)) {
      if ((!foot || !EXCLUDED_FOOT_TAGS.includes(foot)) &&
          (!access || !['private', 'customers', 'military', 'destination', 'no'].includes(access)) &&
          (!footwayTag || footwayTag !== 'sidewalk')) {
        appendReason('include', `footway with bicycle=${bicycle}`);
      }
    }
  }

  // Step 4b: Crossings (Must come after unpaved footways)
  if (included === true && highway === 'footway' && footwayTag === 'crossing') {
    appendReason('exclude', 'footway=crossing');
  }

  // Step 9: Named service roads
  if (included === false && highway === 'service' && name != null && serviceTag == null) {
    if ((!foot || !EXCLUDED_FOOT_TAGS.includes(foot)) &&
        (!access || !['private', 'customers', 'military', 'destination', 'no'].includes(access))) {
      appendReason('include', 'named service road (no sub-tag)');
    }
  }

  // Step 10: Misc Exclusions
  if (included === true) {
    if (motorroad === 'yes') {
      appendReason('exclude', 'motorroad=yes');
    } else if (covered === 'yes') {
      appendReason('exclude', 'covered=yes');
    } else if (indoor === 'yes') {
      appendReason('exclude', 'indoor=yes');
    } else if (['yes', 'building_passage'].includes(tunnel)) {
      appendReason('exclude', `tunnel=${tunnel}`);
    } else if (['yes', 'designated', 'private'].includes(golfCart)) {
      appendReason('exclude', `golf_cart=${golfCart}`);
    }
  }

  return {
    included,
    filter_reason: filterReason || 'default: excluded',
    steps,
    normalized: norm
  };
}
