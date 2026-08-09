// nlu.js — small, free, rule-based intent parser. No LLM API call, runs fully offline in the browser.
const VippyNLU = (() => {
  const WAKE_PATTERNS = [/hey\s+vippy/i, /hi\s+vippy/i, /\bvippy\b/i, /hey\s+vip+y/i];

  function stripWakeWord(text) {
    let out = text;
    WAKE_PATTERNS.forEach(p => { out = out.replace(p, ''); });
    return out.replace(/^[,\s]+/, '').trim();
  }

  function containsWakeWord(text) {
    return WAKE_PATTERNS.some(p => p.test(text));
  }

  // Extract a "book a journey" intent: origin + destination from natural phrasing.
  // Handles: "from X to Y", "go from X to Y", "take me from X to Y",
  //          "to Y" (origin implied = current location),
  //          "I want to go to Y", "book a journey to Y from X"
  function parseJourney(rawText) {
    const text = stripWakeWord(rawText)
      .replace(/^(please\s+)?(can you\s+)?(book( me)?( a)? (a )?journey|i want to go|i'd like to go|i need to go|take me|go|navigate me)\s*/i, '')
      .trim();

    let origin = null, destination = null;

    let m = text.match(/from\s+(.+?)\s+to\s+(.+)$/i);
    if (m) {
      origin = m[1].trim();
      destination = m[2].trim();
    } else {
      m = text.match(/(.+?)\s+to\s+(.+)$/i) && text.match(/^to\s+(.+)$/i);
      if (m) {
        destination = m[1].trim();
      } else {
        m = text.match(/^(.+?)\s+to\s+(.+)$/i);
        if (m) {
          origin = m[1].trim();
          destination = m[2].trim();
        } else {
          m = text.match(/to\s+(.+)$/i);
          if (m) destination = m[1].trim();
        }
      }
    }

    destination = cleanPlace(destination);
    origin = cleanPlace(origin);

    if (!destination) return { intent: 'unknown', raw: rawText };
    return { intent: 'book_journey', origin, destination, raw: rawText };
  }

  function cleanPlace(p) {
    if (!p) return p;
    // Strip a leading article — "the British Museum" geocodes worse than "British Museum"
    // (Nominatim's exact-name matching prefers the bare name).
    return p.replace(/[.?!]+$/, '').replace(/^(the|my|a)\s+/i, '').trim();
  }

  // Simple yes/no detection for conversational confirmation
  function parseYesNo(text) {
    const t = text.trim().toLowerCase();
    if (/^(yes|yeah|yep|correct|that's right|confirm|sure|ok|okay|affirmative)\b/.test(t)) return 'yes';
    if (/^(no|nope|not quite|incorrect|cancel|wrong)\b/.test(t)) return 'no';
    return null;
  }

  return { containsWakeWord, stripWakeWord, parseJourney, parseYesNo };
})();
