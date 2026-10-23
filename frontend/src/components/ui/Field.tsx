import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Icon } from '../icons/Icon';
import { VoiceGuideButton } from './VoiceGuideButton';

/**
 * Shared label / hint / error frame for every form control.
 *
 * Keeping this in one place is what stops the error treatment drifting between
 * a text input and a select: the message, the icon and the `aria-describedby`
 * wiring are written once.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  optionalLabel,
  disabled,
  className,
  voiceGuide,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  optionalLabel?: string;
  disabled?: boolean;
  className?: string;
  voiceGuide?: string;
  children: ReactNode;
}) {
  const hasError = Boolean(error);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <label
          htmlFor={id}
          className={cn(
            'min-w-0 flex-1 text-label',
            disabled ? 'text-content-disabled' : 'text-content-secondary',
          )}
        >
          {label}
        </label>
        {optional && optionalLabel && (
          <span className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-label-sm font-medium text-amber-100">
            {optionalLabel}
          </span>
        )}
        {voiceGuide && <VoiceGuideButton text={voiceGuide} onDark />}
      </div>

      {children}

      {(hint || error) && (
        <p
          id={`${id}-message`}
          role={hasError ? 'alert' : undefined}
          className={cn(
            'flex items-start gap-1.5 text-body-sm',
            hasError ? 'text-[var(--status-danger)]' : 'text-content-tertiary',
          )}
        >
          {hasError && <Icon name="alert" size={16} className="mt-0.5 shrink-0" />}
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Shared box styling for inputs and selects, so both sit on the same grid. */
export function fieldBoxClass(
  hasError: boolean,
  disabled?: boolean,
  variant: 'input' | 'select' = 'input',
) {
  const isSelect = variant === 'select';
  return cn(
    isSelect
      ? 'w-full min-h-14 cursor-pointer rounded-xl border-[1.5px] border-slate-300 bg-white p-3 text-base font-medium leading-6 text-slate-900 transition-colors'
      : 'w-full rounded-md border-[1.5px] px-4 py-3 text-body text-content-primary transition-colors',
    'outline-none placeholder:text-content-tertiary',
    'focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[rgba(77,92,134,0.22)]',
    disabled
      ? 'cursor-not-allowed border-line-subtle bg-bg-subtle text-content-disabled'
      : !isSelect && 'bg-bg-surface',
    hasError ? 'border-[var(--status-danger)]' : !disabled && !isSelect && 'border-line',
  );
}
