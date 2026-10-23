import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Rating } from '../ui/Rating';
import { VerificationBadge } from '../ui/VerificationBadge';
import { cardHover } from '../../motion/animation';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { Company } from '../../data/content';
import '../../styles/spotlight.css';

/**
 * Solar company listing.
 *
 * Hover only changes border, shadow and CTA emphasis — nothing reflows, so a
 * grid of these never shifts under the pointer.
 */
export function CompanyCard({ company, interactive = true }: { company: Company; interactive?: boolean }) {
  const prefersReduced = useReducedMotion();
  const { t, pick, lang } = useLanguage();
  const name = pick(company.name);
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? '')
    .join('');
  const logoPalettes = [
    'border-blue-300/20 bg-blue-400/10 text-blue-200',
    'border-teal-300/20 bg-teal-400/10 text-teal-200',
    'border-violet-300/20 bg-violet-400/10 text-violet-200',
    'border-amber-300/20 bg-amber-400/10 text-amber-200',
  ];
  const logoPaletteIndex = Array.from(company.id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % logoPalettes.length;
  return (
    <motion.article
      data-spotlight
      whileHover={prefersReduced ? undefined : { ...cardHover, boxShadow: '0 0 20px rgba(245,158,11,0.2)' }}
      className={cn(
        'relative isolate mx-auto flex h-full max-w-sm flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]',
        company.featured && 'border-amber-400/70 shadow-[0_8px_28px_rgba(245,158,11,0.16)]',
      )}
    >
      <div className="relative z-10 flex flex-1 flex-col gap-4">
        <div>
          {company.featured && (
            <p className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-body-xs text-amber-200">
              <Icon name="award" size={14} />
              {t('co.topRated')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border text-base font-bold tracking-wide shadow-inner ${logoPalettes[logoPaletteIndex]}`}
          >
            {initials}
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 h-10 text-label font-bold leading-5 text-slate-100">{name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-body-xs text-slate-300">
              <Icon name="map-pin" size={14} className="shrink-0" />
              <span className="shrink-0 font-medium text-slate-400">{lang === 'ar' ? 'المقر الرئيسي:' : 'Headquarters:'}</span>
              {pick(company.location)}
            </p>
          </div>
        </div>

        <div>
          <VerificationBadge status={company.status} className="w-fit" />
          {company.isPreview && (
            <p className="mt-2 w-fit rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-body-xs font-semibold text-amber-950">
              {t('co.previewOnly')}
            </p>
          )}
        </div>
        <div className="flex items-center">
          <Rating score={company.rating} reviewCount={company.reviews} tone="onDark" />
        </div>

        <hr className="border-white/15" />

        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dd className="flex items-center gap-1 text-body-xs text-amber-300">
              <Icon name="check" size={13} className="shrink-0 text-amber-400" />
              {pick(company.projects)}
            </dd>
            <dt className="mt-0.5 text-body-xs text-slate-300">{t('co.completed')}</dt>
          </div>
          <div>
            <dd className="flex items-center gap-1 text-body-xs text-amber-300">
              <Icon name="trending-up" size={13} className="shrink-0 text-amber-400" />
              {pick(company.experience)}
            </dd>
            <dt className="mt-0.5 text-body-xs text-slate-300">{t('co.experience')}</dt>
          </div>
        </dl>

        <ul className="flex flex-wrap gap-1.5">
          {pick(company.services).map((s) => (
            <li key={s} className="shrink-0">
              <Chip className="border border-amber-500/20 !bg-slate-900/70 !text-amber-100/80">{s}</Chip>
            </li>
          ))}
        </ul>

        {(company.branchCount ?? 0) > 0 && (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-body-xs text-slate-300">
            <Icon name="map-pin" size={13} className="text-amber-300" />
            {lang === 'ar' ? `+${company.branchCount} فروع إضافية` : `+${company.branchCount} Branches`}
          </p>
        )}

        {interactive && !company.isPreview ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            trailingArrow={company.featured}
            className="mt-auto rounded-xl border border-amber-500/20 !bg-[#F8F6F0] px-5 py-3 text-label font-semibold !text-slate-900 shadow-sm transition-all duration-300 hover:border-indigo-400/30 hover:!bg-indigo-900/15 hover:!text-indigo-900"
            onClick={() => { window.location.hash = `#/companies/${company.id}`; }}
          >
            {t('co.view')}
            <span className="sr-only"> — {name}</span>
          </Button>
        ) : company.isPreview ? (
          <span aria-hidden="true" className="mt-auto block rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-center text-label font-semibold text-slate-300">
            {t('co.previewOnly')}
          </span>
        ) : (
          <span aria-hidden="true" className="mt-auto block rounded-xl border border-amber-500/20 bg-[#F8F6F0] px-5 py-3 text-center text-label font-bold text-slate-900 shadow-sm">
            {t('co.view')}
          </span>
        )}
      </div>
    </motion.article>
  );
}
