/**
 * Overpass API Service & OSM GeoJSON Builder
 */

import { evaluateStreet, getHighwayColor, lineIntersectsPolygon } from './filterEngine.js';

export const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

const STORAGE_KEY_CUSTOM_ENDPOINT = 'osm_filter_custom_overpass_endpoint';

// Simple in-memory bbox query cache
const queryCache = new Map();

export function getCustomEndpoint() {
  return localStorage.getItem(STORAGE_KEY_CUSTOM_ENDPOINT) || '';
}

export function setCustomEndpoint(url) {
  const trimmed = (url || '').trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_ENDPOINT, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_ENDPOINT);
  }
}

export function getActiveEndpoints() {
  const custom = getCustomEndpoint();
  const list = [];
  if (custom) {
    list.push(custom);
  }
  for (const ep of DEFAULT_ENDPOINTS) {
    if (!list.includes(ep)) {
      list.push(ep);
    }
  }
  return list;
}

function getBboxKey(bbox) {
  return bbox.map(n => n.toFixed(3)).join(',');
}

/**
 * Query Overpass API for all highway ways and nature area polygons inside a bounding box
 * @param {Array<number>} bbox - [west, south, east, north]
 * @param {Function} [onStatusUpdate]
 * @returns {Promise<{streets: Object, natureAreas: Object}>} GeoJSON collections
 */
export async function fetchOverpassStreets(bbox, onStatusUpdate = () => {}) {
  const cacheKey = getBboxKey(bbox);
  if (queryCache.has(cacheKey)) {
    onStatusUpdate('Loading cached map data...', 'Cache');
    return queryCache.get(cacheKey);
  }

  const [west, south, east, north] = bbox;
  const overpassBbox = `${south},${west},${north},${east}`;

  // Query streets AND nature area polygons in the same bounding box
  const query = `
    [out:json][timeout:30];
    (
      way["highway"](${overpassBbox});
      way["leisure"~"park|nature_reserve|garden|pitch|playground"](${overpassBbox});
      relation["leisure"~"park|nature_reserve"](${overpassBbox});
      way["landuse"~"forest|meadow|grass|village_green|recreation_ground"](${overpassBbox});
      relation["landuse"~"forest|meadow|grass|recreation_ground"](${overpassBbox});
      way["natural"~"wood|scrub|heath|grassland"](${overpassBbox});
      relation["natural"~"wood|scrub|heath|grassland"](${overpassBbox});
      way["boundary"~"national_park|protected_area"](${overpassBbox});
      relation["boundary"~"national_park|protected_area"](${overpassBbox});
    );
    out body;
    >;
    out skel qt;
  `;

  const endpoints = getActiveEndpoints();
  let lastError = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const hostName = getHostName(endpoint);
    
    if (i > 0) {
      onStatusUpdate(`Endpoint failed. Rotating to provider #${i + 1} (${hostName})...`, endpoint);
    } else {
      onStatusUpdate(`Fetching OSM data via ${hostName}...`, endpoint);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      onStatusUpdate(`Evaluating street inclusion rules & nature areas (${hostName})...`, endpoint);
      
      const parsed = parseOverpassData(data);
      
      if (queryCache.size >= 20) {
        const firstKey = queryCache.keys().next().value;
        queryCache.delete(firstKey);
      }
      queryCache.set(cacheKey, parsed);

      return parsed;
    } catch (err) {
      console.warn(`Overpass endpoint ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`All Overpass API servers failed. ${lastError ? lastError.message : ''}`);
}

/**
 * Query Overpass API for a single OSM way by ID
 * @param {string|number} wayId
 * @param {Function} [onStatusUpdate]
 * @returns {Promise<Object>} Single street GeoJSON feature
 */
export async function fetchWayById(wayId, onStatusUpdate = () => {}) {
  const cleanId = String(wayId).trim().replace(/^(?:way\/|osm\/|w\/)?/i, '').replace(/[^0-9]/g, '');
  if (!cleanId) {
    throw new Error('Please enter a valid numeric OSM Way ID (e.g. 10478174 or way/10478174).');
  }

  const query = `
    [out:json][timeout:25];
    (
      way(${cleanId});
    );
    out body;
    >;
    out skel qt;
  `;

  const endpoints = getActiveEndpoints();
  let lastError = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const hostName = getHostName(endpoint);
    onStatusUpdate(`Fetching OSM Way #${cleanId} via ${hostName}...`, endpoint);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const parsed = parseOverpassData(data);

      if (!parsed.streets.features || parsed.streets.features.length === 0) {
        const wayElem = data.elements ? data.elements.find(el => el.type === 'way' && String(el.id) === cleanId) : null;
        if (wayElem) {
          throw new Error(`OSM Way #${cleanId} exists but is not tagged as a street (highway=*). Tags found: ${JSON.stringify(wayElem.tags || {})}`);
        } else {
          throw new Error(`OSM Way #${cleanId} was not found on OpenStreetMap.`);
        }
      }

      return parsed.streets.features[0];
    } catch (err) {
      console.warn(`Overpass endpoint ${endpoint} failed for Way #${cleanId}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : `Failed to fetch OSM Way #${cleanId}.`);
}

function getHostName(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

/**
 * Convert Overpass JSON response into GeoJSON FeatureCollections for streets and nature areas
 */
export function parseOverpassData(overpassData) {
  if (!overpassData || !overpassData.elements) {
    return {
      streets: { type: 'FeatureCollection', features: [] },
      natureAreas: { type: 'FeatureCollection', features: [] }
    };
  }

  // 1. Build node lookup table
  const nodeMap = new Map();
  const streetWays = [];
  const natureWays = [];

  for (const el of overpassData.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [el.lon, el.lat]);
    } else if (el.type === 'way') {
      if (el.tags && el.tags.highway) {
        streetWays.push(el);
      } else if (el.tags && isNatureAreaTags(el.tags)) {
        natureWays.push(el);
      }
    }
  }

  // 2. Build Nature Area GeoJSON features & coordinate list
  const natureFeatures = [];
  const naturePolygons = [];

  for (const way of natureWays) {
    if (!way.nodes || way.nodes.length < 3) continue;
    const coordinates = [];
    for (const nodeId of way.nodes) {
      const coords = nodeMap.get(nodeId);
      if (coords) coordinates.push(coords);
    }
    if (coordinates.length < 3) continue;

    // Ensure polygon loop is closed
    if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
        coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
      coordinates.push(coordinates[0]);
    }

    const areaType = way.tags.leisure || way.tags.landuse || way.tags.natural || way.tags.boundary || 'nature_area';
    
    naturePolygons.push(coordinates);
    natureFeatures.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coordinates] },
      properties: {
        id: way.id,
        osm_id: way.id,
        name: way.tags.name || 'Unnamed Nature Area',
        area_type: areaType,
        tags: way.tags
      }
    });
  }

  // 3. Build Street GeoJSON features with nature area evaluation
  const streetFeatures = [];

  for (const way of streetWays) {
    if (!way.nodes || way.nodes.length < 2) continue;

    const coordinates = [];
    for (const nodeId of way.nodes) {
      const coords = nodeMap.get(nodeId);
      if (coords) coordinates.push(coords);
    }

    if (coordinates.length < 2) continue;

    // Evaluate street against rules + nature area polygons
    const evaluation = evaluateStreet(way.tags, naturePolygons, coordinates);
    const highway = way.tags.highway || 'unclassified';

    streetFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {
        id: way.id,
        osm_id: way.id,
        name: way.tags.name || 'Unnamed Street',
        highway,
        foot: way.tags.foot || null,
        access: way.tags.access || null,
        surface: way.tags.surface || null,
        bicycle: way.tags.bicycle || null,
        sidewalk: way.tags.sidewalk || null,
        included: evaluation.included,
        filter_reason: evaluation.filter_reason,
        steps: evaluation.steps,
        tags: way.tags,
        _color: evaluation.included ? getHighwayColor(highway) : '#ef4444',
        _opacity: evaluation.included ? 0.8 : 0.45
      }
    });
  }

  return {
    streets: { type: 'FeatureCollection', features: streetFeatures },
    natureAreas: { type: 'FeatureCollection', features: natureFeatures }
  };
}

function isNatureAreaTags(tags) {
  if (!tags) return false;
  if (['park', 'nature_reserve', 'garden', 'pitch', 'playground'].includes(tags.leisure)) return true;
  if (['forest', 'meadow', 'grass', 'village_green', 'recreation_ground'].includes(tags.landuse)) return true;
  if (['wood', 'scrub', 'heath', 'grassland'].includes(tags.natural)) return true;
  if (['national_park', 'protected_area'].includes(tags.boundary)) return true;
  return false;
}
