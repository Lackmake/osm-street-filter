/**
 * Main Application Bootstrap & UI Controller
 */

import { initMap, updateMapData, updateNatureAreasData, toggleNatureAreasVisibility, setLayerFilters, flyToLocation, focusOnStreetFeature } from './mapManager.js';
import { fetchOverpassStreets, fetchWayById, getCustomEndpoint, setCustomEndpoint } from './overpassService.js';
import { searchLocation } from './locationSearch.js';
import { FILTER_RULES } from './filterRulesData.js';
import { getHighwayColor } from './filterEngine.js';

// Application State
const state = {
  currentGeoJSON: { type: 'FeatureCollection', features: [] },
  natureGeoJSON: { type: 'FeatureCollection', features: [] },
  viewMode: 'included', // 'included' | 'excluded' | 'both'
  hiddenHighways: new Set(),
  showNatureAreas: false,
  isFetching: false,
  highwayBreakdown: {},
  rulesFilterMode: 'all', // 'all' | 'include' | 'exclude'
  rulesSearchQuery: ''
};

// DOM Elements
let headerFetchBtn, sidebarFetchBtn, fetchSpinner, fetchIcon, fetchBtnLabel;
let statusBanner, zoomLevelEl, natureAreasToggle;
let providerBadge, providerText, providerDot;
let customEndpointInput, saveEndpointBtn;
let inspectWayInput, inspectWayBtn;
let highwayListEl, typeResetBtn;
let searchInput, searchClearBtn, searchResults;
let sidebar, sidebarToggleBtn;
let headerRulesBtn, mobileRulesBtn, filterRulesModal, closeModalBtn;
let rulesSearchInput, rulesListContainer, rulesFilterBtns;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Map
  const map = initMap('map');

  // 2. Bind DOM References
  bindDOM();

  // 3. Attach Event Listeners
  attachEventListeners(map);
});

function bindDOM() {
  headerFetchBtn = document.getElementById('header-fetch-btn');
  sidebarFetchBtn = document.getElementById('sidebar-fetch-btn');
  fetchSpinner = document.getElementById('fetch-spinner');
  fetchIcon = document.getElementById('fetch-icon');
  fetchBtnLabel = document.getElementById('fetch-btn-label');
  statusBanner = document.getElementById('status-banner');
  zoomLevelEl = document.getElementById('zoom-level');
  natureAreasToggle = document.getElementById('nature-areas-toggle');
  
  providerBadge = document.getElementById('provider-badge');
  providerText = document.getElementById('provider-text');
  providerDot = providerBadge ? providerBadge.querySelector('.provider-dot') : null;
  customEndpointInput = document.getElementById('custom-endpoint-input');
  saveEndpointBtn = document.getElementById('save-endpoint-btn');
  inspectWayInput = document.getElementById('inspect-way-input');
  inspectWayBtn = document.getElementById('inspect-way-btn');

  highwayListEl = document.getElementById('highway-list');
  typeResetBtn = document.getElementById('type-reset-btn');
  
  searchInput = document.getElementById('search-input');
  searchClearBtn = document.getElementById('search-clear-btn');
  searchResults = document.getElementById('search-results');
  sidebar = document.getElementById('sidebar');
  sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

  // Modal DOM Elements
  headerRulesBtn = document.getElementById('header-rules-btn');
  mobileRulesBtn = document.getElementById('mobile-rules-btn');
  filterRulesModal = document.getElementById('filter-rules-modal');
  closeModalBtn = document.getElementById('close-modal-btn');
  rulesSearchInput = document.getElementById('rules-search-input');
  rulesListContainer = document.getElementById('rules-list-container');
  rulesFilterBtns = document.querySelectorAll('[data-rules-filter]');

  if (customEndpointInput) {
    customEndpointInput.value = getCustomEndpoint();
  }
}

function attachEventListeners(map) {
  // Primary On-Demand Fetch Action
  const triggerFetch = () => handleFetchStreets(map);
  headerFetchBtn.addEventListener('click', triggerFetch);
  sidebarFetchBtn.addEventListener('click', triggerFetch);

  // Filter Rules Modal Event Listeners
  if (headerRulesBtn) headerRulesBtn.addEventListener('click', openRulesModal);
  if (mobileRulesBtn) mobileRulesBtn.addEventListener('click', openRulesModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeRulesModal);

  if (filterRulesModal) {
    filterRulesModal.addEventListener('click', (e) => {
      if (e.target === filterRulesModal) closeRulesModal();
    });
  }

  if (rulesSearchInput) {
    rulesSearchInput.addEventListener('input', (e) => {
      state.rulesSearchQuery = e.target.value.toLowerCase().trim();
      renderFilterRules();
    });
  }

  if (rulesFilterBtns) {
    rulesFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        rulesFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.rulesFilterMode = btn.dataset.rulesFilter;
        renderFilterRules();
      });
    });
  }

  // Nature Areas Layer Toggle
  if (natureAreasToggle) {
    natureAreasToggle.addEventListener('change', (e) => {
      state.showNatureAreas = e.target.checked;
      toggleNatureAreasVisibility(state.showNatureAreas);
    });
  }

  // Save Custom Overpass Endpoint
  if (saveEndpointBtn) {
    saveEndpointBtn.addEventListener('click', () => {
      const val = customEndpointInput.value;
      setCustomEndpoint(val);
      saveEndpointBtn.textContent = 'Saved!';
      setTimeout(() => { saveEndpointBtn.textContent = 'Save'; }, 1500);
      updateProviderDisplay(val ? `Custom: ${getHost(val)}` : 'Automatic Default Mirrors');
    });
  }

  // Inspect Single Street Action
  if (inspectWayBtn) {
    inspectWayBtn.addEventListener('click', () => {
      handleInspectStreetId(inspectWayInput.value);
    });
  }
  if (inspectWayInput) {
    inspectWayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleInspectStreetId(inspectWayInput.value);
      }
    });
  }

  // Map zoom level indicator
  map.on('zoom', () => {
    const zoom = Math.round(map.getZoom() * 10) / 10;
    if (zoomLevelEl) zoomLevelEl.textContent = zoom;
    updateZoomBanner(zoom);
  });

  // View Mode Segmented Controls
  const segmentedBtns = document.querySelectorAll('.display-mode-section .segmented-btn');
  segmentedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      segmentedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewMode = btn.dataset.mode;
      setLayerFilters(state.viewMode, state.hiddenHighways);
    });
  });

  // Highway reset button
  typeResetBtn.addEventListener('click', () => {
    state.hiddenHighways.clear();
    setLayerFilters(state.viewMode, state.hiddenHighways);
    renderHighwayBreakdown();
  });

  // Location & Way ID Search
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    searchClearBtn.hidden = !val;
    clearTimeout(searchDebounce);
    if (!val.trim()) {
      searchResults.hidden = true;
      return;
    }
    searchDebounce = setTimeout(async () => {
      const numMatch = val.trim().match(/^(?:way\/|osm\/|w\/)?(\d+)$/i);
      const results = await searchLocation(val);
      if (numMatch) {
        const wayId = numMatch[1];
        results.unshift({
          isWayInspection: true,
          wayId,
          name: `🔍 Inspect OSM Way #${wayId}`
        });
      }
      renderSearchResults(results);
    }, 300);
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.hidden = true;
    searchResults.hidden = true;
  });

  // Keyboard shortcut: Press Enter to fetch or Escape to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !filterRulesModal.classList.contains('hidden')) {
      closeRulesModal();
    } else if (e.key === 'Enter' && document.activeElement !== searchInput && document.activeElement !== rulesSearchInput) {
      handleFetchStreets(map);
    }
  });

  // Mobile sidebar toggle
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }
}

function updateZoomBanner(zoom) {
  if (zoom < 13) {
    statusBanner.className = 'status-banner warning';
    statusBanner.innerHTML = `Zoom level: <strong>${zoom}</strong> — Zoom in to 14+ for optimal area scanning.`;
  } else {
    statusBanner.className = 'status-banner info';
    statusBanner.innerHTML = `Zoom level: <strong>${zoom}</strong> — Ready to scan visible map area.`;
  }
}

function updateProviderDisplay(statusText, isFetching = false) {
  if (providerText) {
    providerText.textContent = statusText;
  }
  if (providerDot) {
    if (isFetching) {
      providerDot.classList.add('active-fetching');
    } else {
      providerDot.classList.remove('active-fetching');
    }
  }
}

function getHost(url) {
  try { return new URL(url).hostname; } catch(e) { return url; }
}

async function handleFetchStreets(map) {
  if (state.isFetching) return;

  const bounds = map.getBounds();
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  const zoom = map.getZoom();

  if (zoom < 12) {
    alert('Please zoom in a bit closer (level 13+) before fetching streets to avoid overwhelming the Overpass API server.');
    return;
  }

  setFetchingState(true, 'Fetching OSM & nature data...');

  try {
    const data = await fetchOverpassStreets(bbox, (msg, endpoint) => {
      setFetchingState(true, msg);
      if (endpoint) {
        updateProviderDisplay(msg, true);
      }
    });

    state.currentGeoJSON = data.streets;
    state.natureGeoJSON = data.natureAreas;

    updateMapData(data.streets);
    updateNatureAreasData(data.natureAreas);
    toggleNatureAreasVisibility(state.showNatureAreas);

    // Compute breakdown & layer filters
    computeStats(data.streets);
    setLayerFilters(state.viewMode, state.hiddenHighways);

    const count = data.streets.features.length;
    const natureCount = data.natureAreas.features.length;
    updateProviderDisplay(`Loaded ${count} streets${natureCount > 0 ? ` & ${natureCount} nature areas` : ''}`, false);
  } catch (err) {
    console.error('Fetch error:', err);
    alert('Failed to fetch streets: ' + err.message);
    updateProviderDisplay('Fetch failed', false);
  } finally {
    setFetchingState(false);
  }
}

function setFetchingState(isFetching, message = 'Fetch Streets in View') {
  state.isFetching = isFetching;
  
  if (isFetching) {
    fetchSpinner.classList.remove('hidden');
    fetchIcon.classList.add('hidden');
    fetchBtnLabel.textContent = message;
    sidebarFetchBtn.disabled = true;
    headerFetchBtn.disabled = true;
  } else {
    fetchSpinner.classList.add('hidden');
    fetchIcon.classList.remove('hidden');
    fetchBtnLabel.textContent = 'Fetch Streets in View';
    sidebarFetchBtn.disabled = false;
    headerFetchBtn.disabled = false;
  }
}

function computeStats(geojson) {
  const breakdown = {};

  for (const feature of geojson.features) {
    const isInc = feature.properties.included;
    const highway = feature.properties.highway || 'unclassified';

    if (!breakdown[highway]) {
      breakdown[highway] = { highway, included: 0, excluded: 0, total: 0 };
    }
    if (isInc) breakdown[highway].included++;
    else breakdown[highway].excluded++;
    breakdown[highway].total++;
  }

  state.highwayBreakdown = breakdown;
  renderHighwayBreakdown();
}

function renderHighwayBreakdown() {
  const list = Object.values(state.highwayBreakdown).sort((a, b) => b.total - a.total);

  if (list.length === 0) {
    highwayListEl.innerHTML = '<div class="empty-state">No streets fetched yet. Click "Fetch Streets in View".</div>';
    return;
  }

  highwayListEl.innerHTML = list.map(item => {
    const isHidden = state.hiddenHighways.has(item.highway);
    const color = getHighwayColor(item.highway);

    return `
      <div class="highway-row ${isHidden ? 'hidden-type' : ''}" data-highway="${item.highway}">
        <div class="highway-info">
          <span class="color-dot" style="background-color: ${color}"></span>
          <span class="highway-name"><strong>${item.highway}</strong> (${item.total})</span>
        </div>
        <div class="highway-badges">
          <span class="badge badge-success">✓ ${item.included}</span>
          <span class="badge badge-danger">✗ ${item.excluded}</span>
        </div>
      </div>
    `;
  }).join('');

  const rows = highwayListEl.querySelectorAll('.highway-row');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      const highway = row.dataset.highway;
      if (state.hiddenHighways.has(highway)) {
        state.hiddenHighways.delete(highway);
      } else {
        state.hiddenHighways.add(highway);
      }
      setLayerFilters(state.viewMode, state.hiddenHighways);
      renderHighwayBreakdown();
    });
  });
}

function renderSearchResults(results) {
  if (!results || results.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item" style="color: var(--color-text-muted);">No locations found</div>';
    searchResults.hidden = false;
    return;
  }

  searchResults.innerHTML = results.map((item, idx) => `
    <div class="search-result-item ${item.isWayInspection ? 'way-inspection-item' : ''}" data-idx="${idx}">
      ${item.name}
    </div>
  `).join('');

  searchResults.hidden = false;

  const items = searchResults.querySelectorAll('.search-result-item');
  items.forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      const target = results[idx];
      if (target) {
        searchResults.hidden = true;
        if (target.isWayInspection) {
          searchInput.value = `way/${target.wayId}`;
          handleInspectStreetId(target.wayId);
        } else {
          flyToLocation(target.lon, target.lat, 15);
          searchInput.value = target.name.split(',')[0];
        }
      }
    });
  });
}

async function handleInspectStreetId(wayId) {
  if (state.isFetching) return;

  const cleanId = String(wayId).trim().replace(/^(?:way\/|osm\/|w\/)?/i, '').replace(/[^0-9]/g, '');
  if (!cleanId) {
    alert('Please enter a valid numeric OSM Way ID (e.g. 10478174 or way/10478174).');
    return;
  }

  setFetchingState(true, `Inspecting Way #${cleanId}...`);

  try {
    const feature = await fetchWayById(cleanId, (msg, endpoint) => {
      setFetchingState(true, msg);
      if (endpoint) updateProviderDisplay(msg, true);
    });

    state.currentGeoJSON = { type: 'FeatureCollection', features: [feature] };
    
    // Focus map and open popup
    focusOnStreetFeature(feature);

    computeStats(state.currentGeoJSON);
    setLayerFilters(state.viewMode, state.hiddenHighways);

    const name = feature.properties.name || 'Unnamed Street';
    const status = feature.properties.included ? 'Included ✓' : 'Excluded ✗';
    updateProviderDisplay(`Inspected Way #${cleanId} ("${name}") — ${status}`, false);
  } catch (err) {
    console.error('Inspect Way error:', err);
    alert(`Failed to inspect OSM Way #${cleanId}: ${err.message}`);
    updateProviderDisplay(`Inspection failed`, false);
  } finally {
    setFetchingState(false);
  }
}


function openRulesModal() {
  if (!filterRulesModal) return;
  filterRulesModal.classList.remove('hidden');
  filterRulesModal.setAttribute('aria-hidden', 'false');
  renderFilterRules();
  if (rulesSearchInput) rulesSearchInput.focus();
}

function closeRulesModal() {
  if (!filterRulesModal) return;
  filterRulesModal.classList.add('hidden');
  filterRulesModal.setAttribute('aria-hidden', 'true');
}

function renderFilterRules() {
  if (!rulesListContainer) return;

  const query = state.rulesSearchQuery;
  const mode = state.rulesFilterMode;

  const filtered = FILTER_RULES.filter(rule => {
    // Mode filter ('all' | 'include' | 'exclude')
    if (mode === 'include' && rule.action !== 'include') return false;
    if (mode === 'exclude' && rule.action !== 'exclude') return false;

    // Search query filter
    if (query) {
      const matchTitle = rule.title.toLowerCase().includes(query);
      const matchTags = rule.tags.toLowerCase().includes(query);
      const matchSummary = rule.summary.toLowerCase().includes(query);
      const matchDesc = rule.description.toLowerCase().includes(query);
      const matchEx = rule.examples.some(ex => ex.toLowerCase().includes(query));
      return matchTitle || matchTags || matchSummary || matchDesc || matchEx;
    }
    return true;
  });

  if (filtered.length === 0) {
    rulesListContainer.innerHTML = `
      <div class="empty-state">
        No evaluation rules match "${state.rulesSearchQuery}". Try another tag or clear the search.
      </div>
    `;
    return;
  }

  rulesListContainer.innerHTML = filtered.map(rule => `
    <div class="rule-step-card action-${rule.action}">
      <div class="rule-card-header">
        <div class="rule-title-group">
          <span class="step-number-badge">Step ${rule.step}</span>
          <h3 class="rule-card-title">${rule.title}</h3>
        </div>
        <span class="action-badge ${rule.action}">
          ${rule.action === 'include' ? '✓ INCLUDE' : '✗ EXCLUDE'}
        </span>
      </div>

      <div class="rule-tags-box">
        <code>${rule.tags}</code>
      </div>

      <p class="rule-summary">${rule.summary}</p>
      <p class="rule-description">${rule.description}</p>

      ${rule.examples && rule.examples.length > 0 ? `
        <div class="rule-examples-group">
          <span class="example-label">Examples:</span>
          ${rule.examples.map(ex => `<span class="example-chip">${ex}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

