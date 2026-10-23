import { cn } from '../../lib/cn';
import { Icon, type IconName } from '../icons/Icon';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { TranslationKey } from '../../i18n/translations';

export type VerificationStatus = 'verified' | 'identity_verified' | 'pending' | 'rejected';

/**
 * Marketplace trust signal.
 *
 * Status is carried by THREE channels — icon shape, wording and colour — so it
 * survives greyscale printing and colour-blind viewing. Never reduce this to a
 * coloured dot.
 */
const CONFIG: Record<
  VerificationStatus,
  { icon: IconName; label: TranslationKey; desc: TranslationKey; className: string }
> = {
  verified: {
    icon: 'shield-check',
    label: 'badge.verified',
    desc: 'badge.verifiedDesc',
    className:
      'border-emerald-500 bg-gradient-to-r from-emerald-100 via-white to-emerald-100 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(6,95,70,0.16)]',
  },
  identity_verified: {
    icon: 'shield-check',
    label: 'badge.verified',
    desc: 'badge.verifiedDesc',
    className:
      'border-emerald-500 bg-gradient-to-r from-emerald-100 via-white to-emerald-100 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(6,95,70,0.16)]',
  },
  pending: {
    icon: 'clock',
    label: 'badge.pending',
    desc: 'badge.pendingDesc',
    className:
      'border-stone-300 bg-gradient-to-r from-stone-100 to-stone-200 text-stone-700',
  },
  rejected: {
    icon: 'x-mark',
    label: 'badge.rejected',
    desc: 'badge.rejectedDesc',
    className:
      'text-[var(--status-danger)] bg-[var(--status-danger-bg)] border-[var(--status-danger)]',
  },
};

export function VerificationBadge({
  status,
  className,
}: {
  status: VerificationStatus;
  className?: string;
}) {
  const { t } = useLanguage();
  const cfg = CONFIG[status];
  const label = t(cfg.label);
  const desc = t(cfg.desc);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 ps-2.5 pe-3 text-label-sm',
        cfg.className,
        className,
      )}
      title={desc}
    >
      <Icon name={cfg.icon} size={14} />
      {label}
      <span className="sr-only"> — {desc}</span>
    </span>
  );
}
