// map.js — Leaflet + OpenStreetMap tiles. Free, no API key, no Google Maps dependency.
const VippyMap = (() => {
  let map = null;
  let routeLayer = null;
  let markersLayer = null;

  function init() {
    if (map) return map;
    map = L.map('map', { attributionControl: true }).setView([51.5074, -0.1278], 13); // default: London
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    return map;
  }

  function showRoute({ origin, destination, geojson }) {
    init();
    if (routeLayer) map.removeLayer(routeLayer);
    markersLayer.clearLayers();

    routeLayer = L.geoJSON(geojson, { style: { color: '#ffd166', weight: 5 } }).addTo(map);
    L.marker([origin.lat, origin.lon], { title: 'Start' }).addTo(markersLayer)
      .bindPopup(`Start: ${origin.label}`);
    L.marker([destination.lat, destination.lon], { title: 'Destination' }).addTo(markersLayer)
      .bindPopup(`Destination: ${destination.label}`);

    // If the map container has no real size yet (e.g. the tab was backgrounded on a phone while
    // the route was being calculated), fitBounds() has nothing valid to fit. Retry once shortly
    // after invalidating size rather than letting it throw and silently drop the route.
    _fitSafely(routeLayer, origin, destination, 0);
  }

  function _fitSafely(layer, origin, destination, attempt) {
    map.invalidateSize();
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
      return;
    }
    if (attempt < 5) {
      setTimeout(() => _fitSafely(layer, origin, destination, attempt + 1), 150);
    } else {
      // Last resort: at least centre on the midpoint so the route isn't lost entirely.
      map.setView([(origin.lat + destination.lat) / 2, (origin.lon + destination.lon) / 2], 14);
    }
  }

  function invalidate() {
    if (map) setTimeout(() => map.invalidateSize(), 50);
  }

  return { init, showRoute, invalidate };
})();
