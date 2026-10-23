import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../icons/Icon';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { AssessmentInsight, SystemTier } from '../../assessment/utuAssessment';
import type { SolarEstimate } from '../calculator/useSolarEstimate';

type ChatEntry = { from: 'assistant' | 'user'; text: string };
type CustomAnswerTopic = 'warranty' | 'installation' | 'deposit' | 'maintenance' | 'sizing' | 'general';
type PresetQuestion = Exclude<CustomAnswerTopic, 'general'>;

const PRESET_QUESTIONS: readonly PresetQuestion[] = [
  'warranty',
  'installation',
  'deposit',
  'maintenance',
  'sizing',
];

function classifyQuestion(question: string): CustomAnswerTopic {
  const text = question.toLocaleLowerCase();
  if (/warrant|guarantee|ضمان|كفالة|كفاله/.test(text)) return 'warranty';
  if (/install|installation|step|تركيب|تنصيب|خطوات|مباشر/.test(text)) return 'installation';
  if (/deposit|payment|pay|عربون|دفع|دفعة|فلوس/.test(text)) return 'deposit';
  if (/maintenan|clean|repair|صيانة|صيانه|تنظيف|تصليح/.test(text)) return 'maintenance';
  if (/size|capacity|system|battery|panel|حجم|سعة|منظومة|بطارية|بطاريه|لوح|ألواح|الواح/.test(text)) return 'sizing';
  return 'general';
}

/**
 * UTU assistant with guided answers that are available without a calculator
 * estimate. It is informational, not a live AI service.
 */
export function UtuAssistant(props: {
  estimate: SolarEstimate;
  tier: SystemTier;
  insight: AssessmentInsight;
  companyCount: number;
}) {
  const { t } = useLanguage();
  const { estimate } = props;
  const [open, setOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customMessages, setCustomMessages] = useState<ChatEntry[]>([]);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const openAssistant = () => setOpen(true);
    window.addEventListener('utu-assistant:open', openAssistant);
    return () => window.removeEventListener('utu-assistant:open', openAssistant);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [customMessages.length]);

  const askPreset = (topic: PresetQuestion) => {
    setCustomMessages((messages) => [
      ...messages,
      { from: 'user', text: t(`as.assistant.preset.${topic}.question`) },
      { from: 'assistant', text: t(`as.assistant.customAnswer.${topic}`) },
    ]);
  };

  const askCustomQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = customQuestion.trim();
    if (!question) return;
    const topic = classifyQuestion(question);
    setCustomMessages((messages) => [
      ...messages,
      { from: 'user', text: question },
      { from: 'assistant', text: t(`as.assistant.customAnswer.${topic}`) },
    ]);
    setCustomQuestion('');
  };

  // Answers are rendered at display time so switching language re-translates them.
  const messages: ChatEntry[] = [
    {
      from: 'assistant',
      text: estimate.dailyWh > 0 ? t('as.assistant.opening') : t('as.assistant.generalOpening'),
    },
    ...customMessages,
  ];

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('as.assistant.entry')}
        title={t('as.assistant.entry')}
        className="fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-2xl shadow-amber-500/30 flex items-center gap-2.5 cursor-pointer transition-all duration-300 hover:scale-105 border border-amber-300/40"
      >
        <Icon name="zap" size={18} />
        {t('as.assistant.entry')}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="utu-assistant-title"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[10001] m-auto flex h-[min(680px,92dvh)] w-[min(440px,92vw)] flex-col rounded-2xl border border-line-subtle bg-bg-surface shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
                <h2 id="utu-assistant-title" className="text-label font-semibold text-content-primary">{t('as.assistant.title')}</h2>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('as.assistant.close')}
                  className="grid h-8 w-8 place-items-center rounded-full text-content-tertiary hover:bg-bg-subtle"
                >
                  <Icon name="x-mark" size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
                <ul className="flex flex-col gap-3">
                  {messages.map((m, i) => (
                    <li
                      key={i}
                      ref={i === messages.length - 1 ? endRef : undefined}
                      className={
                        m.from === 'assistant'
                          ? 'max-w-[90%] rounded-xl rounded-ss-sm bg-bg-subtle px-3.5 py-2.5 text-body-sm text-content-primary'
                          : 'ms-auto max-w-[90%] rounded-xl rounded-se-sm bg-[var(--brand-primary)] px-3.5 py-2.5 text-body-sm text-content-on-brand'
                      }
                    >
                      {m.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-line-subtle px-5 py-4">
                <p className="mb-2.5 text-label-sm font-medium text-content-tertiary">{t('as.assistant.quickTitle')}</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_QUESTIONS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => askPreset(topic)}
                      className="rounded-full border border-line-subtle px-3 py-1.5 text-label-sm text-content-secondary transition-colors hover:border-line-brand hover:text-content-brand"
                    >
                      {t(`as.assistant.preset.${topic}.question`)}
                    </button>
                  ))}
                </div>
                <form className="mt-3 flex items-center gap-2" onSubmit={askCustomQuestion}>
                  <label className="sr-only" htmlFor="utu-assistant-question">{t('as.assistant.questionLabel')}</label>
                  <input
                    id="utu-assistant-question"
                    value={customQuestion}
                    onChange={(event) => setCustomQuestion(event.target.value)}
                    placeholder={t('as.assistant.questionPlaceholder')}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-subtle bg-bg-page px-3 py-2 text-body-sm text-content-primary outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    type="submit"
                    disabled={!customQuestion.trim()}
                    aria-label={t('as.assistant.sendQuestion')}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-500 text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="arrow-right" size={18} className="rtl:rotate-180" />
                  </button>
                </form>
                <p className="mt-3 text-[0.75rem] leading-snug text-content-tertiary">{t('as.assistant.note')}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
