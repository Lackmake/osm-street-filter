/**
 * Nominatim Location Search Service
 */

/**
 * Search locations via OpenStreetMap Nominatim API
 * @param {string} query 
 * @returns {Promise<Array<{name: string, lat: number, lon: number, display_name: string}>>}
 */
export async function searchLocation(query) {
  if (!query || query.trim().length < 2) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });

    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();

    return data.map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      bbox: item.boundingbox ? item.boundingbox.map(parseFloat) : null
    }));
  } catch (err) {
    console.error('Location search error:', err);
    return [];
  }
}
