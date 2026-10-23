import { useEffect, useMemo, useState } from 'react';
import { CompanyCard } from '../components/cards/CompanyCard';
import { FlowHeader } from '../components/layout/FlowHeader';
import { Icon } from '../components/icons/Icon';
import { useCompanies } from '../api/useCompanies';
import { useSpotlight } from '../motion/useSpotlight';
import { useLanguage } from '../i18n/LanguageProvider';

export function CompaniesDirectoryPage() {
  const { lang } = useLanguage();
  const { companies, source } = useCompanies();
  const spotlightRef = useSpotlight();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const ar = lang === 'ar';

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  const visibleCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...companies]
      .filter((company) =>
        !normalizedQuery ||
        `${company.name.en} ${company.location.en} ${company.name.ar} ${company.location.ar}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
      .sort((a, b) =>
        (b.completedProjects ?? 0) - (a.completedProjects ?? 0)
        || b.rating - a.rating
        || b.reviews - a.reviews
        || a.name.en.localeCompare(b.name.en));
  }, [companies, query]);
  const pageCount = Math.max(1, Math.ceil(visibleCompanies.length / 6));
  const displayedCompanies = visibleCompanies.slice((page - 1) * 6, page * 6);

  return (
    <>
      <FlowHeader />
      <main id="main" className="min-h-[70vh] bg-bg-page pb-20">
        <div className="container-page">
          <header className="border-b border-slate-200/80 py-8">
            <a
              href="#/"
              className="mb-6 inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 transition-all hover:bg-amber-500 hover:text-white hover:shadow-[0_0_16px_rgba(245,158,11,0.2)]"
            >
              <Icon name="arrow-right" size={16} className="rotate-180" />
              {ar ? 'العودة إلى الرئيسية' : 'Back to Home'}
            </a>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">{ar ? 'دليل الشركات' : 'Company directory'}</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{ar ? 'كل شركات الطاقة الشمسية' : 'All solar companies'}</h1>
            <p className="readable-copy mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              {ar ? 'ابحث بين الشركات التي تمت الموافقة على توثيقها.' : 'Search companies approved for verification.'}
            </p>
          </header>

          <div className="mb-8 mt-7 grid items-end gap-5 rounded-2xl border border-amber-500/20 bg-white/80 p-4 shadow-sm backdrop-blur-md md:p-6">
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
              {ar ? 'بحث بالاسم أو الموقع' : 'Search by name or location'}
              <span className="relative block">
                <Icon name="search" size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 ps-11 pe-4 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  placeholder={ar ? 'اكتب اسم شركة أو محافظة' : 'Enter a company or location'}
                />
              </span>
            </label>
          </div>

          {visibleCompanies.length > 0 ? (
            <ul ref={spotlightRef} className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {displayedCompanies.map((company) => (
                <li key={company.id} className="h-full"><CompanyCard company={company} /></li>
              ))}
            </ul>
          ) : (
            <p role="status" className="mt-8 border-y border-line-subtle py-7 text-body text-content-secondary">
              {source === 'loading'
                ? (ar ? 'جارٍ تحميل الشركات…' : 'Loading companies…')
                : source === 'unavailable'
                  ? (ar ? 'تعذّر تحميل الشركات. حاول مرة ثانية لاحقاً.' : 'Companies could not be loaded. Please try again later.')
                  : (ar ? 'ماكو شركات تطابق البحث الحالي.' : 'No companies match the current search.')}
            </p>
          )}
          {pageCount > 1 && (
            <nav
              aria-label={ar ? 'صفحات الشركات' : 'Company pages'}
              className="mt-8 flex items-center justify-center gap-4"
            >
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-line-subtle bg-bg-surface px-4 py-2 text-label text-content-secondary transition hover:border-amber-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                {ar ? 'السابق' : 'Previous'}
              </button>
              <span aria-live="polite" className="text-label-sm text-content-secondary">
                {ar ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}
              </span>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-line-subtle bg-bg-surface px-4 py-2 text-label text-content-secondary transition hover:border-amber-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                {ar ? 'التالي' : 'Next'}
              </button>
            </nav>
          )}
        </div>
      </main>
    </>
  );
}
