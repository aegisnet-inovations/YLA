import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * AEGIS Sentinel — always-on voice listener with wake word.
 *
 *  - Listens continuously (auto-restarts on end/error, handles silent timeouts).
 *  - Waits for the wake word (default "yla" or "hey yla").
 *  - After wake word, captures the NEXT final transcript as a command.
 *  - Speaks the assistant reply aloud.
 *  - Pauses listening while YLA is speaking to avoid self-triggering.
 *  - Watchdog: if no result arrives for WATCHDOG_MS, restart the recognizer.
 *  - Tab visibility: re-arms when the tab returns to focus.
 *
 *  Returns { listening, status, speak, supported }
 */
const WATCHDOG_MS = 20000; // 20s of silence -> restart recognizer
const RETRY_BACKOFF_MS = 800;

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
  const watchdogRef = useRef(null);
  const restartTimerRef = useRef(null);
  const isRunningRef = useRef(false);
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
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
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

    const armWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        // Recognizer went silent — force restart.
        if (!shouldRunRef.current) return;
        try { rec.stop(); } catch { /* noop */ }
        // onend will fire and schedule restart.
      }, WATCHDOG_MS);
    };

    const scheduleRestart = (delay = RETRY_BACKOFF_MS) => {
      if (!shouldRunRef.current) return;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (!shouldRunRef.current || isRunningRef.current) return;
        try {
          rec.start();
        } catch {
          // already running or still winding down — try again shortly
          scheduleRestart(delay * 2);
        }
      }, delay);
    };

    const handleStart = () => {
      isRunningRef.current = true;
      setListening(true);
      if (!speakingRef.current) setStatusSafe('listening');
      armWatchdog();
    };

    const handleResult = (e) => {
      armWatchdog();
      if (speakingRef.current) return; // don't react while YLA is talking
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const transcript = (res[0].transcript || '').trim().toLowerCase();
        if (!transcript) continue;

        if (!armedRef.current) {
          // Waiting for wake word
          const hasWake = wakeWords.some((w) => transcript.includes(w));
          if (hasWake && res.isFinal) {
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
          onCommand?.(transcript);
          armedRef.current = false;
          setStatusSafe('listening');
        }
      }
    };

    const handleEnd = () => {
      isRunningRef.current = false;
      setListening(false);
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (shouldRunRef.current) {
        scheduleRestart(RETRY_BACKOFF_MS);
      }
    };

    const handleError = (ev) => {
      const err = ev?.error;
      // Permission errors are terminal.
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        shouldRunRef.current = false;
        setStatusSafe('denied');
        return;
      }
      // Transient errors — let onend fire and restart.
      // Known transient: 'no-speech', 'audio-capture', 'network', 'aborted'
      // Give the browser a moment before we try again.
      if (err === 'network') {
        scheduleRestart(2000);
      }
    };

    const handleVisibility = () => {
      if (!shouldRunRef.current) return;
      if (document.visibilityState === 'visible' && !isRunningRef.current) {
        scheduleRestart(300);
      }
    };

    rec.onstart = handleStart;
    rec.onresult = handleResult;
    rec.onend = handleEnd;
    rec.onerror = handleError;
    document.addEventListener('visibilitychange', handleVisibility);

    try {
      rec.start();
    } catch {
      // already running — schedule one restart in case the existing instance ends
      scheduleRestart(500);
    }

    return () => {
      shouldRunRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
      rec.onstart = null;
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* noop */ }
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      isRunningRef.current = false;
      setListening(false);
    };
  }, [enabled, supported, onCommand, setStatusSafe, wakeWords]);

  return { listening, status, speak, supported: !!supported };
}
