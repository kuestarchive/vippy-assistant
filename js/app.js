// app.js — UI wiring: tabs, transcript, settings, journeys, accessibility toggles.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const transcriptEl = $('#transcript');
  const statusEl = $('#assistantStatus');
  const micButton = $('#micButton');
  const toastEl = $('#skipToast');

  function addTranscript(text, who) {
    const li = document.createElement('li');
    li.className = who;
    const label = document.createElement('span');
    label.className = 'who';
    label.textContent = who === 'user' ? 'You' : 'Vippy';
    li.appendChild(label);
    li.appendChild(document.createTextNode(text));
    transcriptEl.appendChild(li);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function setStatus(text) { statusEl.textContent = text; }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ----- Tabs -----
  function switchTab(name) {
    $$('.tab-btn').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${name}`));
    if (name === 'map') { VippyMap.init(); VippyMap.invalidate(); }
    if (name === 'journeys') renderJourneys();
  }
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // ----- Voice wiring -----
  VippyVoice.init({
    onTranscript: addTranscript,
    onStatus: setStatus,
    onListening: (isListening) => {
      micButton.classList.toggle('listening', isListening);
      micButton.setAttribute('aria-pressed', String(isListening));
    },
    onSpeaking: (isSpeaking) => micButton.classList.toggle('speaking', isSpeaking),
    onRequestUpdate: (req) => renderActiveRequest(req),
    onVolunteersNotified: (candidates) => {
      toast(`Notified ${candidates.length} nearby volunteers: ${candidates.map(c => c.name).join(', ')}`);
    },
    onJourneyConfirmed: (journey) => {
      renderActiveRequest({ ...journey, status: 'Matched' });
      // Leaflet needs a visible, correctly-sized container before it can fit bounds —
      // switch tabs first, then invalidate size, then draw the route.
      switchTab('map');
      VippyMap.invalidate();
      setTimeout(() => {
        VippyMap.showRoute(journey);
        renderRouteSummary(journey);
      }, 100);
    },
  });

  if (!VippyVoice.supported) {
    setStatus("Your browser doesn't support speech recognition. You can still type requests below — everything else works the same.");
  }

  micButton.addEventListener('click', () => VippyVoice.startPushToTalk());
  micButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); VippyVoice.startPushToTalk(); }
  });

  $('#wakeWordToggle').addEventListener('change', (e) => {
    VippyVoice.setWakeWordMode(e.target.checked);
    if (e.target.checked && !VippyVoice.supported) {
      toast('Continuous listening needs a browser with speech recognition support (try Chrome or Edge).');
      e.target.checked = false;
    }
  });

  $('#typeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#typeInput');
    if (!input.value.trim()) return;
    VippyVoice.handleTypedInput(input.value.trim());
    input.value = '';
  });

  $$('.chip').forEach(chip => chip.addEventListener('click', () => {
    VippyVoice.handleTypedInput(chip.dataset.example);
  }));

  // ----- Map tab -----
  function renderRouteSummary(journey) {
    const { origin, destination, route, volunteer, etaMinutes } = journey;
    const volunteerLine = volunteer
      ? ` · guided by ${volunteer.name} ${volunteer.emoji} (${volunteer.rating}★) — arriving in about ${etaMinutes} min`
      : '';
    $('#routeSummary').textContent =
      `${origin.label} → ${destination.label} · ${VippyGeo.formatDistance(route.distanceMeters)} · about ${VippyGeo.formatDuration(route.durationSeconds)} walking${volunteerLine}`;
    const stepsList = $('#stepsList');
    stepsList.innerHTML = '';
    route.steps.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      stepsList.appendChild(li);
    });
  }

  // ----- Active request card (Journeys tab) -----
  function renderActiveRequest(req) {
    const card = $('#activeRequestCard');
    const text = $('#activeRequestText');
    card.classList.remove('hidden');
    if (req.status === 'Searching') {
      text.textContent = `Searching for a nearby volunteer for ${req.origin.label} → ${req.destination.label}…`;
    } else if (req.status === 'Matched') {
      text.textContent = `${req.volunteer.name} ${req.volunteer.emoji} (${req.volunteer.rating}★, ${req.volunteer.journeys} journeys) is guiding you from ${req.origin.label} to ${req.destination.label} — arriving in about ${req.etaMinutes} minutes.`;
    } else {
      text.textContent = `No volunteers available right now for ${req.origin.label} → ${req.destination.label}. Ask Vippy to try again shortly.`;
    }
  }

  // ----- Journeys tab -----
  function renderJourneys() {
    const data = VippyStore.getAll();
    const favList = $('#favoritesList');
    favList.innerHTML = '';
    if (!data.favorites.length) {
      favList.innerHTML = '<li>No saved places yet.</li>';
    } else {
      data.favorites.forEach(f => {
        const li = document.createElement('li');
        li.innerHTML = `<span><strong>${f.name}</strong> — ${f.place.label}</span>`;
        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.textContent = 'Remove';
        btn.setAttribute('aria-label', `Remove saved place ${f.name}`);
        btn.addEventListener('click', () => { VippyStore.removeFavorite(f.id); renderJourneys(); });
        li.appendChild(btn);
        favList.appendChild(li);
      });
    }

    const histList = $('#journeyHistory');
    histList.innerHTML = '';
    if (!data.history.length) {
      histList.innerHTML = '<li>No journeys yet. Book one from the Voice Assistant tab.</li>';
    } else {
      data.history.forEach(h => {
        const li = document.createElement('li');
        const pill = h.status === 'Matched' ? 'confirmed' : 'requested';
        const volunteerLine = h.volunteer
          ? ` · ${h.volunteer.name} ${h.volunteer.emoji} (${h.volunteer.rating}★)`
          : '';
        li.innerHTML = `<span>${h.originLabel} → ${h.destinationLabel} · ${h.distance} · ${h.duration}${volunteerLine}</span>
          <span class="status-pill ${pill}">${h.status}</span>`;
        histList.appendChild(li);
      });
    }
  }

  $('#addFavoriteBtn').addEventListener('click', async () => {
    const name = prompt('What should we call this place? (e.g. "Home", "Work")');
    if (!name) return;
    const address = prompt(`Address or place name for "${name}"?`);
    if (!address) return;
    try {
      const place = await VippyGeo.geocode(address);
      VippyStore.addFavorite(name, place);
      renderJourneys();
      toast(`Saved "${name}"`);
    } catch (err) {
      toast(err.message || 'Could not find that place');
    }
  });

  // ----- Settings tab -----
  const data0 = VippyStore.getAll();
  if (data0.homeAddress) $('#homeAddressInput').value = data0.homeAddress;
  $('#saveHomeBtn').addEventListener('click', () => {
    const val = $('#homeAddressInput').value.trim();
    if (!val) return;
    VippyStore.setHomeAddress(val);
    toast('Home address saved');
  });

  // ----- Test location (mock GPS for testing outside London) -----
  const MOCK_LOCATIONS = {
    'big-ben': { lat: 51.5007042, lon: -0.1245721, label: 'Big Ben, Westminster' },
    'kings-cross': { lat: 51.5308, lon: -0.1238, label: "King's Cross Station" },
    'trafalgar-square': { lat: 51.5080, lon: -0.1281, label: 'Trafalgar Square' },
    'british-museum': { lat: 51.5192384, lon: -0.1270, label: 'British Museum, Bloomsbury' },
    'london-bridge': { lat: 51.5079, lon: -0.0877, label: 'London Bridge' },
  };
  const mockSelect = $('#mockLocationSelect');
  const savedMock = VippyGeo.getMockLocation();
  const savedMockKey = savedMock && Object.keys(MOCK_LOCATIONS).find(k => MOCK_LOCATIONS[k].label === savedMock.label);
  if (savedMockKey) mockSelect.value = savedMockKey;
  mockSelect.addEventListener('change', (e) => {
    const loc = MOCK_LOCATIONS[e.target.value] || null;
    VippyGeo.setMockLocation(loc);
    toast(loc ? `Simulating your location as ${loc.label}` : 'Using your real device location');
  });

  $('#speechRateRange').value = data0.settings.rate || 1;
  $('#speechRateRange').addEventListener('input', (e) => {
    VippyTTS.setRate(parseFloat(e.target.value));
    VippyStore.saveSettings({ rate: parseFloat(e.target.value) });
  });

  // Vippy's default voice is UK English, female — matching TravelHands' target audience.
  // Known male British voice names to actively avoid when guessing (few platforms label gender
  // directly; Chrome's "Google UK English Female/Male" are the exception and are matched first).
  const UK_MALE_NAMES = /daniel|arthur|george|ralph|rocko \(english \(united kingdom\)\)|reed \(english \(united kingdom\)\)/i;
  function pickDefaultUKFemaleVoice(voices) {
    const ukVoices = voices.filter(v => v.lang === 'en-GB');
    return (
      ukVoices.find(v => /female/i.test(v.name)) ||
      ukVoices.find(v => /hazel|kate|serena|martha|fiona/i.test(v.name)) ||
      ukVoices.find(v => !UK_MALE_NAMES.test(v.name)) ||
      ukVoices[0] ||
      voices.find(v => /female/i.test(v.name)) ||
      voices[0]
    );
  }

  function populateVoices() {
    const sel = $('#voiceSelect');
    const voices = VippyTTS.listVoices().filter(v => v.lang.startsWith('en'));
    if (!voices.length) return;
    sel.innerHTML = voices.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
    const saved = VippyStore.getAll().settings.voiceName;
    const savedVoiceExists = saved && voices.some(v => v.name === saved);
    if (savedVoiceExists) {
      sel.value = saved;
    } else {
      const pick = pickDefaultUKFemaleVoice(voices);
      if (pick) { sel.value = pick.name; VippyStore.saveSettings({ voiceName: pick.name }); }
    }
    VippyTTS.setVoice(sel.value);
  }
  window.speechSynthesis && (window.speechSynthesis.onvoiceschanged = populateVoices);
  populateVoices();

  $('#voiceSelect').addEventListener('change', (e) => {
    VippyTTS.setVoice(e.target.value);
    VippyStore.saveSettings({ voiceName: e.target.value });
  });
  $('#testVoiceBtn').addEventListener('click', () => {
    VippyTTS.speak("Hi, I'm Vippy. I'll sound like this when guiding your journey.");
  });

  // ----- Accessibility toggles -----
  const contrastToggle = $('#contrastToggle');
  const textSizeToggle = $('#textSizeToggle');
  let highContrast = false, fontScale = 1;

  contrastToggle.addEventListener('click', () => {
    highContrast = !highContrast;
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
    contrastToggle.setAttribute('aria-pressed', String(highContrast));
  });
  textSizeToggle.addEventListener('click', () => {
    fontScale = fontScale >= 1.4 ? 1 : fontScale + 0.1;
    document.documentElement.style.setProperty('--font-scale', fontScale.toFixed(1));
  });

  // Initial greeting
  setTimeout(() => {
    addTranscript('Hi, I\'m Vippy! Tap the microphone and say "Hey Vippy" followed by where you\'d like to go.', 'vippy');
  }, 300);
})();
