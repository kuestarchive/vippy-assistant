// storage.js — tiny localStorage wrapper, no backend required
const VippyStore = (() => {
  const KEY = 'vippy_v1';

  function _read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function _write(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function getAll() {
    const d = _read();
    return {
      homeAddress: d.homeAddress || null,
      favorites: d.favorites || [],
      history: d.history || [],
      settings: d.settings || { rate: 1, voiceName: null, contrast: 'normal', fontScale: 1 },
    };
  }

  function setHomeAddress(address) {
    const d = _read();
    d.homeAddress = address;
    _write(d);
  }

  function addFavorite(name, place) {
    const d = _read();
    d.favorites = d.favorites || [];
    d.favorites.push({ name, place, id: `${Date.now()}` });
    _write(d);
  }

  function removeFavorite(id) {
    const d = _read();
    d.favorites = (d.favorites || []).filter(f => f.id !== id);
    _write(d);
  }

  function addJourney(journey) {
    const d = _read();
    d.history = d.history || [];
    const id = `${Date.now()}`;
    d.history.unshift({ ...journey, id });
    _write(d);
    return id;
  }

  function updateJourney(id, patch) {
    const d = _read();
    d.history = (d.history || []).map(j => (j.id === id ? { ...j, ...patch } : j));
    _write(d);
  }

  function saveSettings(partial) {
    const d = _read();
    d.settings = { ...(d.settings || {}), ...partial };
    _write(d);
  }

  return { getAll, setHomeAddress, addFavorite, removeFavorite, addJourney, updateJourney, saveSettings };
})();
