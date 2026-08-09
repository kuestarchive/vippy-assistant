// volunteers.js — a self-contained, simulated volunteer-guide network.
//
// Vippy has no access to TravelHands' real backend or admin systems (no credentials, no API,
// no authorization to send requests into their live production dashboard) — so this models the
// same concept independently: a journey request gets broadcast to nearby volunteers, one of them
// accepts, and the VIP gets guided by a person, not just a walking route. Everything here runs
// entirely inside this app; no TravelHands system is contacted.
const VippyVolunteers = (() => {
  const DEMO_VOLUNTEERS = [
    { id: 'v1', name: 'Sarah', emoji: '🚶‍♀️', rating: 4.9, journeys: 142 },
    { id: 'v2', name: 'James', emoji: '🚴', rating: 4.8, journeys: 98 },
    { id: 'v3', name: 'Priya', emoji: '🚶', rating: 5.0, journeys: 61 },
    { id: 'v4', name: 'Tom', emoji: '🧑', rating: 4.7, journeys: 210 },
    { id: 'v5', name: 'Aisha', emoji: '🚶‍♀️', rating: 4.9, journeys: 45 },
    { id: 'v6', name: 'Marcus', emoji: '🧑‍🦱', rating: 4.6, journeys: 77 },
  ];

  // Roughly place each volunteer within ~3km of the given origin, so "nearby" is relative to
  // where the traveller actually is (not a fixed demo city).
  function _seedPositionsNear(origin) {
    return DEMO_VOLUNTEERS.map(v => {
      const distanceKm = 0.2 + Math.random() * 2.8;
      const bearing = Math.random() * Math.PI * 2;
      const dLat = (distanceKm / 111) * Math.cos(bearing);
      const dLon = (distanceKm / (111 * Math.cos(origin.lat * Math.PI / 180))) * Math.sin(bearing);
      return { ...v, lat: origin.lat + dLat, lon: origin.lon + dLon, distanceKm };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // Simulates: notify nearby volunteers → wait for one to accept → report back.
  // callbacks: onNotified(candidates), onMatched(volunteer, etaMinutes), onNoVolunteers()
  function broadcastRequest(origin, callbacks) {
    const pool = _seedPositionsNear(origin);
    const candidates = pool.slice(0, 3 + Math.floor(Math.random() * 2)); // notify 3-4 nearby

    setTimeout(() => {
      callbacks.onNotified && callbacks.onNotified(candidates);

      setTimeout(() => {
        const foundMatch = Math.random() > 0.08; // ~92% success rate — occasionally nobody's free
        if (!foundMatch) {
          callbacks.onNoVolunteers && callbacks.onNoVolunteers();
          return;
        }
        // Prefer closer volunteers, but it's not always the very closest — mirrors real accept/decline.
        const winner = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
        const etaMinutes = Math.max(2, Math.round(winner.distanceKm * 12)); // ~walking pace
        callbacks.onMatched && callbacks.onMatched(winner, etaMinutes);
      }, 1800 + Math.random() * 1200);
    }, 900);
  }

  return { broadcastRequest, get demoVolunteerCount() { return DEMO_VOLUNTEERS.length; } };
})();
