import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { TranslationKey } from '../../i18n/translations';

export type ParseResult =
  | { value: number; error?: undefined }
  | { value?: undefined; error: TranslationKey; vars?: Record<string, string | number> };

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits, plus ٫ and `,` as decimal marks. */
function normalizeDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .replace(/−/g, '-')
    .trim();
}

/**
 * Validates typed text for a calculator field. Returns the number, or the
 * translation key of the first rule it breaks.
 */
export function parseNumber(
  raw: string,
  { max, integer = false, maxMessage }: { max: number; integer?: boolean; maxMessage?: TranslationKey },
): ParseResult {
  const text = normalizeDigits(raw);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return { error: 'val.number' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: 'val.number' };
  if (value < 0) return { error: 'val.negative' };
  if (integer && !Number.isInteger(value)) return { error: 'val.whole' };
  if (value > max) return maxMessage ? { error: maxMessage } : { error: 'val.max', vars: { n: max } };
  return { value };
}

/**
 * A typed numeric input.
 *
 * The draft text stays local, and only values that pass validation reach
 * `onChange`, so an invalid value never reaches the calculation. Leaving the
 * field puts back the last valid value and clears the error.
 */
export function NumberField({
  value,
  onChange,
  max,
  integer = false,
  maxMessage,
  label,
  className,
  onErrorChange,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
  integer?: boolean;
  maxMessage?: TranslationKey;
  label: string;
  className?: string;
  /** Receives the translated message while the draft is invalid, or null. */
  onErrorChange?: (message: string | null) => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(String(value));
  const [errorKey, setErrorKey] = useState<{ key: TranslationKey; vars?: Record<string, string | number> } | null>(null);
  const reportRef = useRef(onErrorChange);
  reportRef.current = onErrorChange;

  // A change from outside (stepper, new device kind, reset) replaces the draft.
  useEffect(() => {
    const parsed = parseNumber(draft, { max, integer });
    if (parsed.value !== value) {
      setDraft(String(value));
      setErrorKey(null);
    }
    // Only an outside value change should resync; typing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const message = errorKey ? t(errorKey.key, errorKey.vars) : null;
  useEffect(() => {
    reportRef.current?.(message);
  }, [message]);

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      dir="ltr"
      autoComplete="off"
      aria-label={label}
      aria-invalid={errorKey ? true : undefined}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseNumber(raw, { max, integer, maxMessage });
        if (parsed.error) {
          setErrorKey({ key: parsed.error, vars: parsed.vars });
          return;
        }
        setErrorKey(null);
        if (parsed.value !== value) onChange(parsed.value);
      }}
      onBlur={() => {
        setDraft(String(value));
        setErrorKey(null);
      }}
      className={cn(
        'numeric min-w-0 bg-transparent text-content-on-dark outline-none',
        className,
      )}
    />
  );
}
