import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon } from '../icons/Icon';

const ACCESSIBLE_LABEL = 'استمع إلى الإرشادات الصوتية';
const ARABIC_TEXT = /[\u0600-\u06FF]/;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let availableVoices: SpeechSynthesisVoice[] = [];
let voicesChangedSynthesis: SpeechSynthesis | null = null;

function loadVoices(synthesis: SpeechSynthesis): SpeechSynthesisVoice[] {
  if (voicesChangedSynthesis !== synthesis) {
    const previousHandler = synthesis.onvoiceschanged;
    synthesis.onvoiceschanged = (event) => {
      availableVoices = typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : [];
      previousHandler?.call(synthesis, event);
    };
    voicesChangedSynthesis = synthesis;
  }
  const voices = typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : [];
  if (voices.length > 0) availableVoices = voices;
  return availableVoices;
}

export function VoiceGuideButton({ text, onDark = false }: { text: string; onDark?: boolean }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSynthesisAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const showInstruction = () => {
    setShowFallback(true);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setShowFallback(false), 7000);
  };

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
  }, []);

  const speak = () => {
    showInstruction();
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setShowFallback(false), 7000);

    try {
      if (!speechSynthesisAvailable || typeof SpeechSynthesisUtterance === 'undefined') {
        return;
      }

      const synthesis = window.speechSynthesis;
      try {
        synthesis.cancel();
      } catch (error) {
        console.warn('[utu] could not clear the browser speech queue:', error);
      }
      try {
        synthesis.resume();
      } catch (error) {
        console.warn('[utu] could not resume browser speech synthesis:', error);
      }
      activeUtterance = null;
      const utterance = new SpeechSynthesisUtterance(text);
      if (ARABIC_TEXT.test(text)) {
        const voices = loadVoices(synthesis);
        const arabicVoice = voices.find((voice) => /^ar(?:-|$)/i.test(voice.lang));
        if (arabicVoice) {
          utterance.voice = arabicVoice;
          utterance.lang = arabicVoice.lang || 'ar-SA';
        } else {
          utterance.lang = 'ar-SA';
        }
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = 0.9;
      activeUtterance = utterance;
      setIsSpeaking(true);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setIsSpeaking(false), 900);
      utterance.onend = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (activeUtterance !== utterance || event.error === 'canceled') return;
        activeUtterance = null;
        setIsSpeaking(false);
        console.warn('[utu] browser speech synthesis failed:', event.error);
      };
      synthesis.speak(utterance);
    } catch (error) {
      console.warn('[utu] browser speech synthesis failed:', error);
      activeUtterance = null;
      setIsSpeaking(false);
    }
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={ACCESSIBLE_LABEL}
        title={ACCESSIBLE_LABEL}
        onClick={speak}
        className={cn(
          'inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-400/50 transition-colors focus-visible:outline-offset-2',
          onDark ? 'text-amber-200 hover:bg-slate-950/50' : 'text-amber-700 hover:bg-amber-100',
          isSpeaking && 'scale-110 animate-pulse bg-amber-400/20 ring-2 ring-amber-400/40',
        )}
      >
        <Icon name="volume" size={17} />
      </button>
      {showFallback && (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'absolute top-full z-50 mt-2 w-64 rounded-xl border border-amber-300/40 bg-slate-950 px-3 py-2 text-start text-body-sm text-white shadow-xl',
            onDark ? 'end-0' : 'end-0',
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
