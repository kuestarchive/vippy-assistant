// geo.js — free, open, no-API-key geocoding + walking directions.
// Geocoding: OpenStreetMap Nominatim (https://nominatim.org) — public usage policy: max ~1 req/sec.
// Routing: OSRM public demo server (https://project-osrm.org) — free "foot" profile, no key.
// For real production traffic, self-host Nominatim/OSRM or use a rate-limited proxy — the public
// demo servers used here are for prototyping only.
const VippyGeo = (() => {
  let lastNominatimCall = 0;
  const MIN_GAP_MS = 1100; // stay under Nominatim's 1 req/sec policy

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

  async function _throttle() {
    const wait = MIN_GAP_MS - (Date.now() - lastNominatimCall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNominatimCall = Date.now();
  }

  // Resolve a free-text place name to {lat, lon, label}
  async function geocode(query) {
    if (!query) throw new Error('empty query');
    await _throttle();
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      countrycodes: 'gb', // this app is London-scoped — never resolve to a same-named place abroad
      'accept-language': 'en-GB',
    });
    const bias = mockLocation || (isInUK(userLocation) ? userLocation : LONDON);
    const d = 0.15; // ~15km box biases results near the traveller without hard-limiting them
    params.set('viewbox', `${bias.lon - d},${bias.lat + d},${bias.lon + d},${bias.lat - d}`);
    params.set('bounded', '0');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en-GB,en' },
    });
    if (!res.ok) throw new Error('geocoding failed');
    const data = await res.json();
    if (!data.length) throw new Error(`I couldn't find a place called "${query}" in London`);
    const best = data[0];
    return { lat: parseFloat(best.lat), lon: parseFloat(best.lon), label: best.display_name.split(',').slice(0, 3).join(',') };
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

  // Walking directions between two {lat, lon} points via the free OSRM demo server.
  async function route(origin, destination) {
    const url = `https://router.project-osrm.org/route/v1/foot/${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
      `?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('routing failed');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('No walking route could be found');
    const r = data.routes[0];
    const steps = r.legs[0].steps.map(s => humanizeStep(s));
    return {
      distanceMeters: r.distance,
      durationSeconds: r.duration,
      geojson: r.geometry,
      steps,
    };
  }

  function humanizeStep(step) {
    const m = step.maneuver;
    const name = step.name || 'the path';
    const distance = Math.round(step.distance);
    const verbMap = {
      depart: 'Head out',
      arrive: 'Arrive at your destination',
      turn: `Turn ${m.modifier || ''}`.trim(),
      'new name': `Continue onto ${name}`,
      continue: `Continue ${m.modifier || 'straight'} onto ${name}`,
      merge: `Merge onto ${name}`,
      roundabout: `At the roundabout, take the exit onto ${name}`,
    };
    const text = verbMap[m.type] || `Continue onto ${name}`;
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
