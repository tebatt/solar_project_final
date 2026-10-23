import { useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { CompanyCard } from '../components/cards/CompanyCard';
import { Reveal, RevealItem } from '../motion/Reveal';
import { useCompanies } from '../api/useCompanies';
import { useLanguage } from '../i18n/LanguageProvider';
import type { Variants } from 'framer-motion';

const slideFromLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.43, 0.13, 0.23, 0.96] } },
};

export function Companies() {
  const { t, lang } = useLanguage();
  const previewEnabled = import.meta.env.DEV && import.meta.env.VITE_COMPANY_PREVIEW_ENABLED === 'true';
  const { companies, source } = useCompanies({ includePreview: previewEnabled });
  const hasPreviewCompanies = companies.some((company) => company.isPreview);
  const rankedCompanies = useMemo(
    () => [...companies].sort((a, b) =>
      (b.completedProjects ?? 0) - (a.completedProjects ?? 0)
      || b.rating - a.rating
      || b.reviews - a.reviews
      || a.name.en.localeCompare(b.name.en)),
    [companies],
  );
  const visibleCompanies = rankedCompanies.slice(0, 9);
  const hasMoreCompanies = rankedCompanies.length > 6;

  return (
    <section id="companies" aria-labelledby="companies-heading" className="section-y bg-[#faf8f5]">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <div className="max-w-2xl">
            <p className="eyebrow font-bold tracking-wider text-amber-600">{t('co.eyebrow')}</p>
            <h2 id="companies-heading" className="mt-3 text-h1 font-extrabold tracking-tight text-slate-900">
              {t('co.h2')}
            </h2>
            <p className="readable-copy mt-3 text-body-lg text-slate-600">{t('co.lede')}</p>
          </div>
        </Reveal>

        {previewEnabled && hasPreviewCompanies && (
          <p
            role="note"
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-body-sm text-amber-950"
          >
            {t('co.previewWarning')}
          </p>
        )}

        {visibleCompanies.length > 0 ? (
          <div
            id="companies-pocket"
            data-testid="companies-pocket"
            className="relative mt-10"
          >
            <Reveal stagger as="ul" className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {visibleCompanies.map((company, index) => (
                <RevealItem
                  key={company.id}
                  as="li"
                  className={index >= 6 ? 'relative z-10 h-full' : 'relative z-30 h-full'}
                  variants={slideFromLeft}
                >
                  <CompanyCard company={company} />
                </RevealItem>
              ))}
              {hasMoreCompanies && (
                <li
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-[420px] bg-gradient-to-b from-transparent via-[#0f172a]/80 to-[#0f172a]"
                />
              )}
            </Reveal>
            {rankedCompanies.length > 0 && (
              <div className={hasMoreCompanies
                ? 'relative z-40 -mt-24 flex justify-center pb-4'
                : 'mt-10 flex justify-center'}>
                <Button
                  variant="secondary"
                  size="lg"
                  trailingArrow
                  className="relative z-30 rounded-xl border-0 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-600 px-8 py-3.5 font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-300 hover:scale-105 hover:border-0 hover:bg-gradient-to-r hover:from-amber-400 hover:via-amber-500 hover:to-yellow-600 hover:shadow-amber-500/30"
                  onClick={() => { window.location.hash = '#/companies'; }}
                >
                  {t('co.viewAll')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p role="status" className="mt-8 border-y border-line-subtle py-6 text-body text-content-secondary">
            {source === 'loading'
              ? (lang === 'ar' ? 'جارٍ تحميل الشركات…' : 'Loading installers…')
              : source === 'unavailable'
                ? (lang === 'ar' ? 'تعذّر تحميل الشركات حالياً. حاول مرة ثانية لاحقاً.' : 'Companies could not be loaded. Please try again later.')
                : (lang === 'ar' ? 'ماكو شركات مسجلة ومتاحة حالياً.' : 'No registered companies are available yet.')}
          </p>
        )}
      </div>
    </section>
  );
}
