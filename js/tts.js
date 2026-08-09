// tts.js — Speech synthesis wrapper (built into the browser, free, no API key)
const VippyTTS = (() => {
  const synth = window.speechSynthesis;
  let rate = 1;
  let voiceName = null;

  function setRate(r) { rate = r; }
  function setVoice(name) { voiceName = name; }

  function listVoices() {
    return synth ? synth.getVoices() : [];
  }

  function speak(text, { onEnd } = {}) {
    if (!synth) {
      if (onEnd) onEnd();
      return;
    }
    synth.cancel(); // don't queue/overlap — keep it conversational and responsive
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    const voices = listVoices();
    const v = voices.find(v => v.name === voiceName) || voices.find(v => v.lang.startsWith('en'));
    if (v) utter.voice = v;
    if (onEnd) utter.onend = onEnd;
    synth.speak(utter);
    return utter;
  }

  function stop() {
    if (synth) synth.cancel();
  }

  return { speak, stop, listVoices, setRate, setVoice, get supported() { return !!synth; } };
})();
