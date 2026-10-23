import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { cardHover } from '../../motion/animation';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { Project } from '../../data/content';
import { isSafeProjectPhoto } from '../../lib/projectPhotos';

/** Completed installation with previews restricted to safe photo sources. */
export function ProjectCard({ project, onView }: { project: Project; onView?: (project: Project) => void }) {
  const prefersReduced = useReducedMotion();
  const { t, pick } = useLanguage();
  const location = pick(project.location);
  const verifiedReview = project.verifiedReview;
  const photoUrl = isSafeProjectPhoto(project.imageUrl) ? project.imageUrl : undefined;
  const [failedPhoto, setFailedPhoto] = useState(false);

  useEffect(() => {
    setFailedPhoto(false);
  }, [photoUrl]);

  const completed = project.status === 'completed';
  const statusKey = project.status === 'pending'
    ? 'pr.pending'
    : project.status === 'draft'
      ? 'pr.draft'
      : completed ? 'pr.completed' : 'pr.inProgress';
  const status = (
    <p className={`absolute start-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-md ${
      completed
        ? 'border-[#eab308]/50 bg-[#fef08a]/40 text-[#a16207]'
        : 'border-amber-200/80 bg-amber-50/95 text-amber-900'
    }`}>
      <Icon name={completed ? 'check' : 'clock'} size={14} className={completed ? 'text-[#a16207]' : undefined} />
      {t(statusKey)}
    </p>
  );

  return (
    <motion.article
      whileHover={prefersReduced ? undefined : cardHover}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-[#faf8f5] text-slate-800 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-md"
    >
      <div className="relative h-48 w-full overflow-hidden border-b border-slate-200 bg-[#faf8f5]">
      {photoUrl && !failedPhoto ? (
        <img
          src={photoUrl}
          alt={t('pr.imgAlt', { l: location })}
          width={1000}
          height={600}
          loading="lazy"
          decoding="async"
          onError={() => setFailedPhoto(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={t('pr.imgAlt', { l: location })}
          className="grid h-full w-full place-items-center bg-[#faf8f5] text-amber-700"
        >
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-slate-300 bg-white/70 shadow-inner">
            <Icon name="solar-panel" size={30} />
          </span>
        </div>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      {status}
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-5">
        <div>
          <span className="mb-2 inline-block bg-transparent p-0 text-xs font-bold tracking-wide text-[#a16207] underline decoration-[#eab308]/80 underline-offset-4">
            {t(
              project.tone === 'commercial' ? 'pr.typeCommercial'
                : project.tone === 'hybrid' ? 'pr.typeHybrid'
                  : project.tone === 'agricultural' ? 'pr.typeAgricultural'
                    : 'pr.typeResidential',
            )}
          </span>
          <h3 className="text-h4 font-bold text-slate-900">{pick(project.title)}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-label-sm text-slate-700">
            <Icon name="map-pin" size={14} className="shrink-0 text-slate-500" />
            {location}
          </p>
        </div>

        <dl className="flex flex-wrap gap-6">
          <div>
            <dd className="numeric flex items-center gap-1.5 text-label text-slate-800">
              <Icon name="zap" size={15} className="shrink-0 text-amber-600" />
              {project.size}
            </dd>
            <dt className="mt-0.5 text-label-sm text-slate-700">{t('pr.size')}</dt>
          </div>
          <div>
            <dd className="flex items-center gap-1.5 text-label text-slate-800">
              <Icon
                name={project.installationIcon}
                size={15}
                className="shrink-0 text-amber-600"
              />
              {pick(project.installation)}
            </dd>
            <dt className="mt-0.5 text-label-sm text-slate-700">{t('pr.install')}</dt>
          </div>
        </dl>

        <hr className="mt-auto border-slate-200" />

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label-sm text-slate-700">{t('pr.by')}</p>
            <p className="truncate text-label text-slate-800">{pick(project.company)}</p>
          </div>
          <p
            className="numeric flex shrink-0 items-center gap-1 text-label text-slate-800"
            aria-label={t('rate.aria', { s: project.rating })}
          >
            <Icon name="star" size={16} className="fill-amber-400 text-amber-500" />
            {project.rating.toFixed(1)}
          </p>
        </div>

        {verifiedReview?.is_verified && (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="img"
                aria-label={t('rate.aria', { s: verifiedReview.rating })}
                className="flex items-center gap-0.5 text-amber-600"
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Icon
                    key={index}
                    name="star"
                    size={15}
                    className={index < Math.round(verifiedReview.rating) ? '' : 'opacity-30'}
                  />
                ))}
                <span className="numeric ms-1 text-label-sm text-slate-800">
                  {verifiedReview.rating.toFixed(1)}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-body-xs text-slate-700">
                <Icon name="check" size={12} />
                {t('rv.verifiedPurchase')}
              </span>
            </div>
            <blockquote className="readable-copy mt-2 line-clamp-3 text-body-sm text-slate-700">
              {verifiedReview.comment}
            </blockquote>
            <p className="mt-2 text-label-sm text-slate-700">{verifiedReview.client_name}</p>
          </section>
        )}

        <Button
          size="md"
          variant="secondary"
          className="group mt-auto w-full rounded-xl border border-slate-700/60 !bg-slate-900 px-5 py-2.5 text-sm font-semibold !text-slate-100 shadow-sm transition-all duration-200 hover:border-amber-500/50 hover:!bg-slate-800 hover:!text-amber-400"
          onClick={() => onView?.(project)}
        >
          <span className="flex items-center justify-center gap-2">
            {t('pr.viewProject')}
            <Icon
              name="arrow-right"
              size={18}
              className="rtl:-scale-x-100 transition-transform group-hover:translate-x-1"
            />
          </span>
        </Button>
      </div>
    </motion.article>
  );
}
