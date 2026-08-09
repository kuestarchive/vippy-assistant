# Vippy — a free, open, voice-first travel assistant (proof of concept)

Vippy is a from-scratch, accessibility-first rebuild of the idea behind TravelHands' "VIP Assistant"
(voice-driven journey booking for visually impaired travellers), with a focus on the MVP the user asked
for: a **voice assistant** that wakes on "Hey Vippy", understands a spoken journey request, confirms it
conversationally, and books/plots the route.

It is a **static site** — plain HTML/CSS/JS, no backend, no build step, no npm install — so it can be
hosted directly on GitHub Pages for free.

> **Note on scope:** I could not get past the TravelHands login screen (no credentials, and creating an
> account for you wasn't something I'd do without asking first), so this was built from the app's public
> description plus the detailed feature spec you gave. The "booking" here plots a real walking route and
> saves it to journey history — it does not dispatch a real human guide, since that requires TravelHands'
> own backend/guide-matching system which isn't something this POC has access to.

## Why every service used here is free / open-source

| Need | Service used | Why it's free |
|---|---|---|
| Speech-to-text (wake word + commands) | Browser's built-in **Web Speech API** (`SpeechRecognition`) | Built into Chrome/Edge/Safari, no key, no cost |
| Text-to-speech (conversational replies) | Browser's built-in **SpeechSynthesis** | Same — built into the browser |
| Understanding the request ("from X to Y") | A small **rule-based parser** (`js/nlu.js`) | Runs entirely client-side, no LLM API call, works offline |
| Map tiles | **OpenStreetMap** via Leaflet.js | Free, open-data map tiles, no API key |
| Turning "Big Ben" into coordinates | **Nominatim** (OpenStreetMap's free geocoder) | No key; the app self-throttles to Nominatim's 1 req/sec fair-use policy |
| Walking directions | **OSRM** public demo routing server | Free, open-source routing engine, no key |

No Google Maps API, no OpenAI/Anthropic API calls for understanding speech, and no paid services anywhere
in the stack. The trade-off: the public Nominatim/OSRM demo servers are rate-limited and meant for
prototyping — see "Going to production" below.

## Features implemented (mapped to the VIP assistant concept)

- **Voice Assistant tab (MVP)** — tap-to-talk mic button, optional always-listening "Hey Vippy" wake-word
  mode, conversational confirmation ("So you want to go from X to Y — is that correct?"), and a live
  captioned transcript (so it's also usable by deaf-blind users or in noisy environments).
- **Map tab** — real walking route drawn on an OpenStreetMap map, with distance/duration and full
  turn-by-turn text directions (also screen-reader readable, not just visual).
- **Journeys tab** — saved places (e.g. "Home", "Work") and a history of booked journeys.
- **Settings tab** — home address (so "go home" works), speech rate, choice of system voice.
- **Accessibility** — semantic landmarks & ARIA roles throughout, skip-to-content link, live regions for
  status/transcript, high-contrast mode toggle, adjustable text size, large (140px) touch targets, full
  keyboard operability, and a typed-text fallback for every voice interaction (so nothing requires speech
  or sight to use).
- **Typed fallback + example chips** — anyone who can't or doesn't want to use voice/wake-word (or is on
  Firefox, which doesn't support SpeechRecognition) can type the same commands and get the identical
  conversational flow.

## Try it locally

No build step needed. From this folder:

```bash
python3 -m http.server 8420
```

Then open `http://localhost:8420`. Try tapping the mic and saying:

> "Hey Vippy, book a journey from Big Ben to the British Museum"

or type it into the fallback box if your browser/mic isn't cooperating.

## Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `vippy-assistant`) and push this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Save — GitHub will publish it at `https://<your-username>.github.io/vippy-assistant/`.

```bash
git add -A
git commit -m "Vippy voice assistant POC"
git branch -M main
git remote add origin https://github.com/<your-username>/vippy-assistant.git
git push -u origin main
```

(I've prepared the repo locally but have **not** created it on GitHub or pushed — that's a publishing
step, so it's for you to trigger, or ask me to do it and I will once you confirm.)

## Browser support for voice

| Browser | Wake word / continuous listening | Push-to-talk | Notes |
|---|---|---|---|
| Chrome / Edge (desktop & Android) | ✅ | ✅ | Best support |
| Safari (macOS/iOS) | ⚠️ Partial | ✅ | Continuous mode may stop after short pauses |
| Firefox | ❌ | ❌ | No SpeechRecognition support — typed fallback works fully |

Microphone permission is required and requested by the browser on first use.

## Going to production (beyond this POC)

- Replace the public **Nominatim**/**OSRM** demo endpoints with self-hosted instances (both are
  open-source and free to self-host) or a paid tier of an open provider (e.g. **OpenRouteService**,
  **Mapbox**, **Geoapify**) once volume grows — the public demo servers are not meant for real traffic.
- Swap the rule-based `js/nlu.js` parser for a proper NLU/LLM if you want to understand messier phrasing —
  it currently handles the "from X to Y" / "to Y" patterns the spec asked for, but won't handle everything.
- Real guide dispatch would need to talk to TravelHands' (or your own) backend — this POC only simulates
  the "booked" state locally.

## File structure

```
index.html          Tab layout: Voice Assistant / Map / Journeys / Settings
css/styles.css       High-contrast-first, accessible styling
js/storage.js        localStorage (favorites, home address, journey history, settings)
js/tts.js            SpeechSynthesis wrapper
js/geo.js            Nominatim geocoding + OSRM routing (throttled, free, no keys)
js/nlu.js            Rule-based wake-word + "from X to Y" intent parsing
js/map.js            Leaflet/OpenStreetMap rendering
js/voice.js          Wake-word + conversational confirm/book state machine
js/app.js            UI wiring: tabs, transcript, settings, accessibility toggles
```
