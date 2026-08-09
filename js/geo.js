// geo.js — free, open, no-API-key geocoding + walking directions.
// Geocoding: OpenStreetMap Nominatim (https://nominatim.org) — public usage policy: max ~1 req/sec.
// Routing: OSRM public demo server (https://project-osrm.org) — free "foot" profile, no key.
// For real production traffic, self-host Nominatim/OSRM or use a rate-limited proxy — the public
// demo servers used here are for prototyping only.
const VippyGeo = (() => {
  let lastNominatimCall = 0;
  const MIN_GAP_MS = 1100; // stay under Nominatim's 1 req/sec policy

  // Default bias center: central London (TravelHands is a UK service). Used only until/unless we
  // get the traveller's real location — without SOME bias, a query like "Big Ben" can resolve to a
  // same-named hill on the other side of the world instead of the London landmark.
  const DEFAULT_BIAS = { lat: 51.5074, lon: -0.1278 };
  let userLocation = null; // {lat, lon} — used to bias search results near the traveller
  navigator.geolocation && navigator.geolocation.getCurrentPosition(
    pos => { userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
    () => { /* geolocation denied/unavailable — we fall back to DEFAULT_BIAS below */ },
    { timeout: 5000 }
  );

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
    });
    const bias = userLocation || DEFAULT_BIAS;
    const d = 0.15; // ~15km box biases results near the traveller without hard-limiting them
    params.set('viewbox', `${bias.lon - d},${bias.lat + d},${bias.lon + d},${bias.lat - d}`);
    params.set('bounded', '0');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('geocoding failed');
    const data = await res.json();
    if (!data.length) throw new Error(`I couldn't find a place called "${query}"`);
    const best = data[0];
    return { lat: parseFloat(best.lat), lon: parseFloat(best.lon), label: best.display_name.split(',').slice(0, 3).join(',') };
  }

  async function currentLocation() {
    if (userLocation) return { ...userLocation, label: 'your current location' };
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available on this device'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'your current location' }),
        () => reject(new Error("I couldn't access your current location")),
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

  return { geocode, currentLocation, route, formatDistance, formatDuration };
})();
