// geo.js — geocoding + walking directions via Geoapify (free tier, no card required).
// Geocoding: https://www.geoapify.com/geocoding-api/ — 3,000 free credits/day
// Routing: https://www.geoapify.com/routing-api/ — same free daily quota
// Both replace the public Nominatim/OSRM demo servers used earlier: Geoapify runs dedicated
// infrastructure meant for real apps, rather than shared best-effort demo servers.
// Map tiles still come from OpenStreetMap directly (js/map.js) — no key needed for those.
const VippyGeo = (() => {
  const API_KEY = VIPPY_CONFIG.GEOAPIFY_API_KEY;

  // This app is scoped to London (that's TravelHands' market), so London is the default and
  // dominant bias for every search — not the device's real location. A device far from the UK
  // (a phone testing from abroad, a sandboxed dev environment, etc.) previously overrode this and
  // sent "Big Ben" to the wrong hemisphere entirely, coming back with non-English place names too.
  const LONDON = { lat: 51.5074, lon: -0.1278 };
  const UK_BOUNDS = { minLat: 49.8, maxLat: 60.9, minLon: -8.6, maxLon: 1.8 };
  const isInUK = (loc) => loc && loc.lat >= UK_BOUNDS.minLat && loc.lat <= UK_BOUNDS.maxLat &&
    loc.lon >= UK_BOUNDS.minLon && loc.lon <= UK_BOUNDS.maxLon;

  let userLocation = null; // {lat, lon} — only trusted as a search bias if it's actually in the UK
  navigator.geolocation && navigator.geolocation.getCurrentPosition(
    pos => { userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
    () => { /* geolocation denied/unavailable — we fall back to London below */ },
    { timeout: 5000 }
  );

  // Test/demo mode: override "your current location" with a chosen London spot instead of the
  // device's real GPS — useful when testing from outside London (e.g. the device is actually in
  // Bangalore) but you want Vippy to behave as if you're at, say, Big Ben.
  let mockLocation = (VippyStore.getAll().settings || {}).mockLocation || null;
  function setMockLocation(loc) {
    mockLocation = loc; // {lat, lon, label} or null to go back to real/default location
    VippyStore.saveSettings({ mockLocation: loc });
  }
  function getMockLocation() { return mockLocation; }

  // Resolve a free-text place name to {lat, lon, label}
  async function geocode(query) {
    if (!query) throw new Error('empty query');
    const bias = mockLocation || (isInUK(userLocation) ? userLocation : LONDON);
    const params = new URLSearchParams({
      text: query,
      apiKey: API_KEY,
      filter: 'countrycode:gb', // this app is London-scoped — never resolve to a same-named place abroad
      bias: `proximity:${bias.lon},${bias.lat}`,
      lang: 'en',
      format: 'json',
      limit: '1',
    });
    const res = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
    if (!res.ok) throw new Error('geocoding failed');
    const data = await res.json();
    if (!data.results || !data.results.length) throw new Error(`I couldn't find a place called "${query}" in London`);
    const best = data.results[0];
    return { lat: best.lat, lon: best.lon, label: (best.formatted || best.address_line1).split(',').slice(0, 3).join(',').trim() };
  }

  async function currentLocation() {
    if (mockLocation) return { ...mockLocation };
    if (isInUK(userLocation)) return { ...userLocation, label: 'your current location' };
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return resolve({ ...LONDON, label: 'central London' });
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          resolve(isInUK(loc) ? { ...loc, label: 'your current location' } : { ...LONDON, label: 'central London' });
        },
        () => resolve({ ...LONDON, label: 'central London' }), // default to London rather than fail
        { timeout: 8000 }
      );
    });
  }

  // Walking directions between two {lat, lon} points via Geoapify Routing.
  async function route(origin, destination) {
    const params = new URLSearchParams({
      waypoints: `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`,
      mode: 'walk',
      apiKey: API_KEY,
      format: 'geojson',
      details: 'instruction_details',
    });
    const res = await fetch(`https://api.geoapify.com/v1/routing?${params.toString()}`);
    if (!res.ok) throw new Error('routing failed');
    const data = await res.json();
    if (!data.features || !data.features.length) throw new Error('No walking route could be found');
    const feature = data.features[0];
    const props = feature.properties;
    const steps = (props.legs || []).flatMap(leg => (leg.steps || []).map(humanizeStep));
    return {
      distanceMeters: props.distance,
      durationSeconds: props.time,
      geojson: feature.geometry,
      steps,
    };
  }

  function humanizeStep(step) {
    const text = (step.instruction && step.instruction.text) || 'Continue';
    const distance = Math.round(step.distance || 0);
    return distance > 0 ? `${text} — ${distance} m` : text;
  }

  function formatDistance(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }
  function formatDuration(s) {
    const mins = Math.round(s / 60);
    return mins <= 1 ? '1 minute' : `${mins} minutes`;
  }

  return { geocode, currentLocation, route, formatDistance, formatDuration, setMockLocation, getMockLocation };
})();
