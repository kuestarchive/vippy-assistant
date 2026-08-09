// voice.js — wake-word ("Hey Vippy") + conversational booking state machine.
// Uses the browser's built-in SpeechRecognition (Web Speech API) — free, no API key.
// Best support: Chrome / Edge (desktop & Android). Safari: partial. Firefox: not supported —
// the app always falls back gracefully to the on-screen "type a request" box.
const VippyVoice = (() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  const STATE = { IDLE: 'idle', AWAITING_COMMAND: 'awaiting_command', CONFIRMING: 'confirming', RESOLVING: 'resolving' };
  let state = STATE.IDLE;
  let pendingJourney = null; // { origin: text, destination: text }
  let continuousMode = false;
  let recognizer = null;
  let manualListening = false;

  let hooks = {
    onTranscript: () => {},
    onStatus: () => {},
    onListening: () => {},
    onSpeaking: () => {},
    onJourneyConfirmed: () => {},
    onRequestUpdate: () => {},
    onVolunteersNotified: () => {},
  };

  function init(customHooks) {
    hooks = { ...hooks, ...customHooks };
  }

  function say(text, andThen) {
    hooks.onTranscript(text, 'vippy');
    hooks.onStatus(text);
    hooks.onSpeaking(true);
    VippyTTS.speak(text, { onEnd: () => { hooks.onSpeaking(false); if (andThen) andThen(); } });
  }

  function _makeRecognizer({ continuous }) {
    const r = new SpeechRecognition();
    r.lang = 'en-GB';
    r.continuous = continuous;
    r.interimResults = continuous; // only need interim results while scanning for the wake word
    r.maxAlternatives = 1;
    return r;
  }

  // --- Manual push-to-talk: user taps the mic, says wake word + command (or just the command) ---
  function startPushToTalk() {
    if (!supported) {
      hooks.onStatus("Voice input isn't supported in this browser. Please type your request below.");
      return;
    }
    if (manualListening) return;
    stopContinuous();
    manualListening = true;
    hooks.onListening(true);
    hooks.onStatus(state === STATE.CONFIRMING ? "I'm listening — was that correct?" : "I'm listening…");

    recognizer = _makeRecognizer({ continuous: false });
    recognizer.onresult = (e) => {
      const text = e.results[0][0].transcript;
      handleUtterance(text);
    };
    recognizer.onerror = () => {
      hooks.onStatus("Sorry, I didn't catch that. Please try again or type your request.");
    };
    recognizer.onend = () => {
      manualListening = false;
      hooks.onListening(false);
      if (continuousMode) startContinuous();
    };
    recognizer.start();
  }

  // --- Continuous "always listening for Hey Vippy" mode ---
  function setWakeWordMode(enabled) {
    continuousMode = enabled;
    if (enabled) startContinuous(); else stopContinuous();
  }

  function startContinuous() {
    if (!supported || manualListening) return;
    try {
      recognizer = _makeRecognizer({ continuous: true });
      recognizer.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        const text = last[0].transcript;
        if (!last.isFinal) {
          if (VippyNLU.containsWakeWord(text)) {
            hooks.onStatus('I heard "Hey Vippy" — go ahead, I\'m listening.');
          }
          return;
        }
        if (VippyNLU.containsWakeWord(text) || state !== STATE.IDLE) {
          handleUtterance(text);
        }
      };
      recognizer.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          hooks.onStatus('Microphone access was blocked, so continuous listening is off. You can still tap the mic button.');
          continuousMode = false;
        }
      };
      recognizer.onend = () => { if (continuousMode && !manualListening) startContinuous(); };
      recognizer.start();
      hooks.onStatus('Always-listening mode is on. Say "Hey Vippy" any time.');
    } catch (err) { /* already started — ignore */ }
  }

  function stopContinuous() {
    if (recognizer) { try { recognizer.onend = null; recognizer.stop(); } catch (e) {} }
  }

  // --- Typed fallback goes through the exact same pipeline as speech ---
  function handleTypedInput(text) {
    handleUtterance(text);
  }

  function handleUtterance(rawText) {
    hooks.onTranscript(rawText, 'user');

    if (state === STATE.CONFIRMING) {
      const yn = VippyNLU.parseYesNo(rawText);
      if (yn === 'yes') return resolveAndBook();
      if (yn === 'no') {
        pendingJourney = null;
        state = STATE.IDLE;
        return say("No problem — let's try again. Where would you like to go, and from where?");
      }
      return say('Sorry, just to confirm — please say "yes" to book this journey, or "no" to change it.');
    }

    const intent = VippyNLU.parseJourney(rawText);
    if (intent.intent !== 'book_journey') {
      return say('I can help you book a journey. Try saying, "Hey Vippy, go from Big Ben to the museum."');
    }

    pendingJourney = { originText: intent.origin, destinationText: intent.destination };
    confirmJourney();
  }

  function confirmJourney() {
    state = STATE.CONFIRMING;
    const from = pendingJourney.originText || 'your current location';
    const to = pendingJourney.destinationText;
    say(`So you want to go from ${from} to ${to} — is that correct?`);
  }

  async function resolveAndBook() {
    state = STATE.RESOLVING;
    say('Great — working that out now.');
    hooks.onStatus('Finding places and calculating your walking route…');
    try {
      const store = VippyStore.getAll();
      const resolveText = async (text) => {
        if (!text) return VippyGeo.currentLocation();
        if (/^home$/i.test(text.trim())) {
          if (!store.homeAddress) throw new Error("You haven't set a home address yet. Add one in Settings.");
          return VippyGeo.geocode(store.homeAddress);
        }
        const fav = store.favorites.find(f => f.name.toLowerCase() === text.trim().toLowerCase());
        if (fav) return fav.place;
        return VippyGeo.geocode(text);
      };

      const [origin, destination] = await Promise.all([
        resolveText(pendingJourney.originText),
        resolveText(pendingJourney.destinationText),
      ]);

      const route = await VippyGeo.route(origin, destination);

      // A "journey" here means a volunteer guide, not just a walking route — record the request
      // and broadcast it, same as tapping "request a guide" would in the real TravelHands app.
      const journeyId = VippyStore.addJourney({
        originLabel: origin.label, destinationLabel: destination.label,
        distance: VippyGeo.formatDistance(route.distanceMeters),
        duration: VippyGeo.formatDuration(route.durationSeconds),
        status: 'Searching',
        volunteer: null,
      });
      hooks.onRequestUpdate({ id: journeyId, status: 'Searching', origin, destination, route });
      say(`Got it — I'm sending your request to nearby volunteers now.`);

      VippyVolunteers.broadcastRequest(origin, {
        onNotified: (candidates) => {
          hooks.onVolunteersNotified(candidates);
          hooks.onStatus(`I've reached out to ${candidates.length} volunteers near ${origin.label}…`);
        },
        onMatched: (volunteer, etaMinutes) => {
          VippyStore.updateJourney(journeyId, { status: 'Matched', volunteer, etaMinutes });
          const journey = { id: journeyId, origin, destination, route, volunteer, etaMinutes, status: 'Matched' };
          hooks.onJourneyConfirmed(journey);
          state = STATE.IDLE;
          pendingJourney = null;
          say(`Good news — ${volunteer.name} has accepted your request! ${volunteer.name} is ${volunteer.distanceKm.toFixed(1)} kilometres away, rated ${volunteer.rating} stars from ${volunteer.journeys} journeys, and should reach you in about ${etaMinutes} minutes to guide you from ${origin.label} to ${destination.label}.`);
        },
        onNoVolunteers: () => {
          VippyStore.updateJourney(journeyId, { status: 'No volunteers available' });
          hooks.onRequestUpdate({ id: journeyId, status: 'No volunteers available', origin, destination, route });
          state = STATE.IDLE;
          pendingJourney = null;
          say(`I'm sorry — no volunteers are available right now. I've saved your request and you can ask me to try again shortly.`);
        },
      });
    } catch (err) {
      state = STATE.IDLE;
      pendingJourney = null;
      say(`Sorry — ${err.message || 'something went wrong booking that journey'}. Let's try again.`);
    }
  }

  return {
    get supported() { return supported; },
    init, startPushToTalk, setWakeWordMode, handleTypedInput,
  };
})();
