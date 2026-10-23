import { useId } from 'react';
import { Icon } from '../icons/Icon';
import { VoiceGuideButton } from '../ui/VoiceGuideButton';
import { NumberField } from './NumberField';
import type { TranslationKey } from '../../i18n/translations';

/**
 * Numeric stepper for the calculator.
 *
 * Both buttons are 36px so they clear the 24px minimum comfortably and sit
 * close to the 44px recommendation once the row's padding is counted. The
 * value sits in a polite live region so a screen reader hears the new number
 * without focus moving.
 *
 * Minus stays on the reading-start side in both directions — the row mirrors
 * with the page, so the control does too.
 *
 * The value itself can also be typed; see NumberField for validation.
 */
export function Stepper({
  label,
  fullLabel,
  value,
  min = 0,
  max = 99,
  decreaseLabel,
  increaseLabel,
  voiceGuide,
  integer = false,
  maxMessage,
  valueLabel,
  onErrorChange,
  onChange,
}: {
  /** Short visible caption, e.g. "Units". */
  label: string;
  /** Unambiguous name, e.g. "Air Conditioner units". Used for the live region. */
  fullLabel: string;
  value: number;
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
  voiceGuide?: string;
  /** Only whole numbers may be typed. */
  integer?: boolean;
  /** Message shown when a typed value is above `max`. */
  maxMessage?: TranslationKey;
  /** Accessible name of the typed field. */
  valueLabel: string;
  onErrorChange?: (message: string | null) => void;
  onChange: (next: number) => void;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;

  return (
    <div className="flex flex-1 flex-col gap-1 sm:flex-none">
      <span className="flex items-center gap-1">
        <span id={labelId} className="text-label-sm text-content-on-dark-muted">{label}</span>
        {voiceGuide && <VoiceGuideButton text={voiceGuide} onDark />}
      </span>
      <span className="sr-only" id={`${id}-full`}>
        {fullLabel}
      </span>
      <div className="flex items-center rounded-[9px] border border-line-on-dark bg-bg-panel-raised transition-colors focus-within:border-line-brand">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={decreaseLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-s-[9px] text-content-on-dark-muted transition-colors hover:text-content-on-dark disabled:opacity-40"
        >
          <Icon name="minus" size={16} />
        </button>
        <NumberField
          value={value}
          max={max}
          integer={integer}
          maxMessage={maxMessage}
          label={valueLabel}
          onErrorChange={onErrorChange}
          onChange={onChange}
          className="w-10 flex-1 text-center text-label sm:flex-none"
        />
        <span role="status" aria-live="polite" aria-labelledby={`${id}-full`} className="sr-only">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={increaseLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-e-[9px] text-content-on-dark-muted transition-colors hover:text-content-on-dark disabled:opacity-40"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}
