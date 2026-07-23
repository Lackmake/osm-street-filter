/**
 * Map Manager powered by MapLibre GL JS
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

let map = null;
let currentPopup = null;
let onStreetClickCallback = null;

const STORAGE_KEY_MAP_POS = 'osm_filter_map_pos';

const MAP_STYLE = {
  version: 8,
  sources: {
    'carto-positron': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }
  },
  layers: [
    {
      id: 'carto-positron-layer',
      type: 'raster',
      source: 'carto-positron',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

export function getInitialMapPos() {
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const parts = hash.split('/');
    if (parts.length === 3) {
      const zoom = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const lng = parseFloat(parts[2]);
      if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) {
        return { center: [lng, lat], zoom };
      }
    }
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_MAP_POS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number' && typeof parsed.zoom === 'number') {
        return { center: [parsed.lng, parsed.lat], zoom: parsed.zoom };
      }
    }
  } catch (err) {
    console.warn('Failed to parse saved map position:', err);
  }

  return { center: [8.6724, 49.4103], zoom: 14 };
}

export function saveMapPos(mapInstance) {
  if (!mapInstance) return;
  const center = mapInstance.getCenter();
  const zoom = mapInstance.getZoom();

  const posObj = {
    lat: Math.round(center.lat * 100000) / 100000,
    lng: Math.round(center.lng * 100000) / 100000,
    zoom: Math.round(zoom * 100) / 100
  };

  try {
    localStorage.setItem(STORAGE_KEY_MAP_POS, JSON.stringify(posObj));
  } catch (err) {
    console.warn('Failed to save map position to localStorage:', err);
  }

  const newHash = `#${posObj.zoom}/${posObj.lat}/${posObj.lng}`;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash);
  }
}

export function initMap(containerId) {
  const initial = getInitialMapPos();

  map = new maplibregl.Map({
    container: containerId,
    style: MAP_STYLE,
    center: initial.center,
    zoom: initial.zoom,
    pitchWithRotate: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true
  }), 'top-right');

  map.on('moveend', () => {
    saveMapPos(map);
  });

  map.on('load', () => {
    setupMapLayers();
    saveMapPos(map);
  });

  return map;
}

export function getMapInstance() {
  return map;
}

function setupMapLayers() {
  if (!map) return;

  // Nature Areas Source & Fill/Outline Layers (placed below street lines)
  if (!map.getSource('nature-areas')) {
    map.addSource('nature-areas', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  if (!map.getLayer('nature-areas-fill')) {
    map.addLayer({
      id: 'nature-areas-fill',
      type: 'fill',
      source: 'nature-areas',
      paint: {
        'fill-color': '#22c55e',
        'fill-opacity': 0.15
      }
    });
  }

  if (!map.getLayer('nature-areas-outline')) {
    map.addLayer({
      id: 'nature-areas-outline',
      type: 'line',
      source: 'nature-areas',
      paint: {
        'line-color': '#22c55e',
        'line-width': 1.5,
        'line-opacity': 0.7
      }
    });
  }

  // Streets Source & Layers
  if (!map.getSource('streets')) {
    map.addSource('streets', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  if (!map.getLayer('streets-included')) {
    map.addLayer({
      id: 'streets-included',
      type: 'line',
      source: 'streets',
      filter: ['==', ['get', 'included'], true],
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['coalesce', ['get', '_color'], '#22c55e'],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, 2.5,
          15, 4.5,
          18, 7
        ],
        'line-opacity': 0.85
      }
    });
  }

  if (!map.getLayer('streets-excluded')) {
    map.addLayer({
      id: 'streets-excluded',
      type: 'line',
      source: 'streets',
      filter: ['!=', ['get', 'included'], true],
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#ef4444',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, 2,
          15, 3.5,
          18, 6
        ],
        'line-opacity': 0.55,
        'line-dasharray': [2, 2]
      }
    });
  }

  const setCursor = () => { map.getCanvas().style.cursor = 'pointer'; };
  const resetCursor = () => { map.getCanvas().style.cursor = ''; };

  ['streets-included', 'streets-excluded'].forEach(layerId => {
    map.on('mouseenter', layerId, setCursor);
    map.on('mouseleave', layerId, resetCursor);
    map.on('click', layerId, handleStreetClick);
  });

  map.on('mouseenter', 'nature-areas-fill', setCursor);
  map.on('mouseleave', 'nature-areas-fill', resetCursor);
  map.on('click', 'nature-areas-fill', handleNatureClick);
}

function handleStreetClick(e) {
  if (!e.features || !e.features.length) return;
  const feature = e.features[0];
  const props = feature.properties;
  
  let tags = props.tags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch (err) { tags = {}; }
  }

  let steps = props.steps;
  if (typeof steps === 'string') {
    try { steps = JSON.parse(steps); } catch (err) { steps = []; }
  }

  showStreetPopup(e.lngLat, {
    id: props.id,
    osm_id: props.osm_id,
    name: props.name || 'Unnamed Street',
    highway: props.highway,
    included: typeof props.included === 'boolean' ? props.included : props.included === 'true',
    filter_reason: props.filter_reason,
    steps,
    tags: tags || {}
  });

  if (onStreetClickCallback) {
    onStreetClickCallback(feature);
  }
}

function handleNatureClick(e) {
  if (!e.features || !e.features.length) return;
  const feature = e.features[0];
  const props = feature.properties;

  if (currentPopup) currentPopup.remove();

  const osmUrl = `https://www.openstreetmap.org/way/${props.osm_id}`;

  const html = `
    <div class="street-popup-content">
      <div class="popup-header">
        <h3 class="popup-title">${props.name || 'Unnamed Nature Area'}</h3>
        <span class="status-badge included">Nature Area</span>
      </div>
      <div class="popup-meta">
        <span class="highway-badge">Type: <code>${props.area_type}</code></span>
        <span class="osm-id">OSM: #${props.osm_id}</span>
      </div>
      <div class="popup-footer" style="margin-top: 8px;">
        <a href="${osmUrl}" target="_blank" rel="noopener noreferrer" class="popup-osm-link">
          View on OpenStreetMap
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        </a>
      </div>
    </div>
  `;

  currentPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '300px',
    className: 'custom-street-popup'
  })
    .setLngLat(e.lngLat)
    .setHTML(html)
    .addTo(map);
}

export function onStreetClick(cb) {
  onStreetClickCallback = cb;
}

export function showStreetPopup(lngLat, streetData) {
  if (!map) return;

  if (currentPopup) {
    currentPopup.remove();
  }

  const { osm_id, name, highway, included, filter_reason, steps, tags } = streetData;

  const statusBadge = included 
    ? '<span class="status-badge included">✓ Included</span>'
    : '<span class="status-badge excluded">✗ Excluded</span>';

  const keyTags = ['foot', 'access', 'surface', 'bicycle', 'sidewalk', 'area', 'place'];
  const tagPills = keyTags
    .filter(k => tags[k])
    .map(k => `<span class="tag-pill"><code>${k}</code>=${tags[k]}</span>`)
    .join(' ');

  let traceHtml = '';
  if (steps && steps.length) {
    traceHtml = `
      <div class="popup-steps-title">Rule Evaluation Trace:</div>
      <ol class="popup-steps-list">
        ${steps.map(s => `<li class="step-item ${s.action}">${s.reason}</li>`).join('')}
      </ol>
    `;
  } else {
    traceHtml = `<div class="popup-reason"><strong>Reason:</strong> ${filter_reason}</div>`;
  }

  const osmUrl = `https://www.openstreetmap.org/way/${osm_id}`;

  const html = `
    <div class="street-popup-content">
      <div class="popup-header">
        <h3 class="popup-title">${name}</h3>
        ${statusBadge}
      </div>
      
      <div class="popup-meta">
        <span class="highway-badge">highway=<strong>${highway}</strong></span>
        <span class="osm-id">OSM Way: #${osm_id}</span>
      </div>

      ${tagPills ? `<div class="popup-tags">${tagPills}</div>` : ''}

      <div class="popup-trace-box">
        ${traceHtml}
      </div>

      <div class="popup-footer">
        <a href="${osmUrl}" target="_blank" rel="noopener noreferrer" class="popup-osm-link">
          View on OpenStreetMap
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        </a>
      </div>
    </div>
  `;

  currentPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '340px',
    className: 'custom-street-popup'
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

export function updateMapData(geojson) {
  if (!map || !map.getSource('streets')) return;
  map.getSource('streets').setData(geojson);
}

export function updateNatureAreasData(geojson) {
  if (!map || !map.getSource('nature-areas')) return;
  map.getSource('nature-areas').setData(geojson);
}

export function toggleNatureAreasVisibility(visible) {
  if (!map) return;
  const visibility = visible ? 'visible' : 'none';
  if (map.getLayer('nature-areas-fill')) {
    map.setLayoutProperty('nature-areas-fill', 'visibility', visibility);
  }
  if (map.getLayer('nature-areas-outline')) {
    map.setLayoutProperty('nature-areas-outline', 'visibility', visibility);
  }
}

export function setLayerFilters(mode = 'both', hiddenHighways = new Set()) {
  if (!map) return;

  const hiddenArray = Array.from(hiddenHighways);

  let includedFilter;
  if (mode === 'excluded') {
    includedFilter = ['==', ['get', 'included'], 'impossible'];
  } else if (hiddenArray.length > 0) {
    includedFilter = ['all', 
      ['==', ['get', 'included'], true],
      ['!', ['in', ['get', 'highway'], ['literal', hiddenArray]]]
    ];
  } else {
    includedFilter = ['==', ['get', 'included'], true];
  }

  let excludedFilter;
  if (mode === 'included') {
    excludedFilter = ['==', ['get', 'included'], 'impossible'];
  } else if (hiddenArray.length > 0) {
    excludedFilter = ['all', 
      ['!=', ['get', 'included'], true],
      ['!', ['in', ['get', 'highway'], ['literal', hiddenArray]]]
    ];
  } else {
    excludedFilter = ['!=', ['get', 'included'], true];
  }

  if (map.getLayer('streets-included')) map.setFilter('streets-included', includedFilter);
  if (map.getLayer('streets-excluded')) map.setFilter('streets-excluded', excludedFilter);
}

export function flyToLocation(lng, lat, zoom = 15) {
  if (!map) return;
  map.flyTo({ center: [lng, lat], zoom, speed: 1.2 });
}
