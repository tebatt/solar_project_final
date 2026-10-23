import { Chip } from '../ui/Chip';
import { Rating } from '../ui/Rating';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { Review } from '../../data/content';
import { Icon } from '../icons/Icon';

/**
 * Customer review. Deliberately plain — no oversized quote glyphs or portrait
 * photography, both of which read as testimonial decoration rather than
 * evidence.
 */
export function ReviewCard({ review }: { review: Review }) {
  const { t, pick } = useLanguage();

  return (
    <figure className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white/70 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-md">
      <figcaption className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-200 bg-stone-100 text-label font-bold text-slate-800"
        >
          {pick(review.initials)}
        </span>
        <span className="min-w-0">
          <span className="block text-label font-semibold text-slate-900">{pick(review.name)}</span>
          <span className="block text-label-sm text-stone-600">{pick(review.role)}</span>
        </span>
      </figcaption>

      {review.isVerified && (
        <p className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 shadow-[0_1px_1px_0_rgba(0,0,0,0.05)]">
          <Icon name="shield-check" size={15} className="text-amber-600" />
          {t('rv.verified')}
        </p>
      )}
      <Rating score={review.rating} className="[&_svg]:fill-amber-500 [&_svg]:text-amber-500" />

      <blockquote className="readable-copy text-sm font-normal leading-relaxed text-slate-800">{pick(review.body)}</blockquote>

      <dl className="my-4 grid gap-2 border-t border-stone-200/60 pt-4 text-xs font-medium text-stone-600">
        {review.projectTitle && (
          <div>
            <dt>{t('rv.project')}</dt>
            <dd className="text-slate-800">{pick(review.projectTitle)}</dd>
          </div>
        )}
        {review.location && (
          <div>
            <dt>{t('rv.location')}</dt>
            <dd className="text-slate-800">{pick(review.location)}</dd>
          </div>
        )}
        {review.companyName && (
          <div>
            <dt>{t('rv.company')}</dt>
            <dd className="text-slate-800">{pick(review.companyName)}</dd>
          </div>
        )}
      </dl>
      <Chip className="inline-block w-fit border border-stone-200 !bg-stone-100/90 px-2.5 py-1 text-[11px] font-semibold !text-slate-700">
        {pick(review.projectType)}
      </Chip>
    </figure>
  );
}
