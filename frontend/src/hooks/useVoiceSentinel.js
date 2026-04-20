import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * AEGIS Sentinel — always-on voice listener with wake word.
 *
 *  - Listens continuously (re-starts on end, handles errors).
 *  - Waits for the wake word (default "yla" or "hey yla").
 *  - After wake word, captures the NEXT final transcript as a command.
 *  - Speaks the assistant reply aloud.
 *  - Pauses listening while YLA is speaking to avoid self-triggering.
 *
 *  Returns { enabled, listening, status, toggle, speak, supported }
 */
export default function useVoiceSentinel({
  onCommand,
  wakeWords = ['yla', 'hey yla', 'yla ', 'yala'],
  enabled,
  onStatusChange,
}) {
  const recognitionRef = useRef(null);
  const speakingRef = useRef(false);
  const armedRef = useRef(false); // true when wake word heard, awaiting command
  const shouldRunRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('idle');

  const supported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const setStatusSafe = useCallback((s) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.onstart = () => { speakingRef.current = true; setStatusSafe('speaking'); };
      utter.onend = () => { speakingRef.current = false; setStatusSafe(shouldRunRef.current ? 'listening' : 'idle'); };
      utter.onerror = () => { speakingRef.current = false; setStatusSafe(shouldRunRef.current ? 'listening' : 'idle'); };
      window.speechSynthesis.speak(utter);
    } catch {
      speakingRef.current = false;
    }
  }, [setStatusSafe]);

  useEffect(() => {
    if (!supported || !enabled) {
      shouldRunRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      setListening(false);
      setStatusSafe('idle');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;
    shouldRunRef.current = true;

    const handleResult = (e) => {
      if (speakingRef.current) return; // don't react while YLA is talking
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const transcript = (res[0].transcript || '').trim().toLowerCase();
        if (!transcript) continue;

        if (!armedRef.current) {
          // Waiting for wake word
          const hasWake = wakeWords.some((w) => transcript.includes(w));
          if (hasWake && res.isFinal) {
            // strip the wake word and take anything after, or arm for next utterance
            let after = transcript;
            for (const w of wakeWords) {
              const idx = after.indexOf(w);
              if (idx !== -1) { after = after.slice(idx + w.length).trim(); break; }
            }
            if (after) {
              onCommand?.(after);
              armedRef.current = false;
              setStatusSafe('listening');
            } else {
              armedRef.current = true;
              setStatusSafe('armed');
            }
          }
        } else if (res.isFinal) {
          // Already armed — take this full utterance as the command
          onCommand?.(transcript);
          armedRef.current = false;
          setStatusSafe('listening');
        }
      }
    };

    const handleEnd = () => {
      setListening(false);
      if (shouldRunRef.current) {
        // Auto-restart to stay always-on
        try { rec.start(); setListening(true); } catch { /* noop */ }
      }
    };

    const handleError = (ev) => {
      // "not-allowed" = mic permission denied; stop.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        shouldRunRef.current = false;
        setStatusSafe('denied');
      }
    };

    rec.onresult = handleResult;
    rec.onend = handleEnd;
    rec.onerror = handleError;

    try {
      rec.start();
      setListening(true);
      setStatusSafe('listening');
    } catch { /* Already started */ }

    return () => {
      shouldRunRef.current = false;
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* noop */ }
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      setListening(false);
    };
  }, [enabled, supported, onCommand, setStatusSafe, wakeWords]);

  return { listening, status, speak, supported: !!supported };
}
