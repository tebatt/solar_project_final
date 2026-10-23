import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Icon } from '../components/icons/Icon';
import { Button } from '../components/ui/Button';
import { ProjectCard } from '../components/cards/ProjectCard';
import { ProjectDetailDialog } from '../components/cards/ProjectDetailDialog';
import { Marquee } from '../components/magicui/marquee';
import { Reveal } from '../motion/Reveal';
import { projects as sampleProjects, type Project } from '../data/content';
import { api, toProject } from '../api/client';
import { useLanguage } from '../i18n/LanguageProvider';
import { paths } from '../routes/useHashRoute';

type ProjectFilter = 'all' | Project['tone'];
const HOME_PROJECT_LIMIT = 9;

const PROJECT_COVERS = [
  '/projects/project_image/project_img1.jpeg',
  '/projects/project_image/project_img2.jpeg',
  '/projects/project_image/project_img3.jpeg',
  '/projects/project_image/project_img4.jpeg',
  '/projects/project_image/project_img5.jpeg',
  '/projects/project_image/project_img6.jpeg',
  '/projects/project_image/project_img7.jpeg',
  '/projects/project_image/project_img8.jpeg',
] as const;

function withLocalProjectCovers(items: Project[]): Project[] {
  return items.map((project, index) => {
    const seededLocalCover = PROJECT_COVERS.find((cover) => cover === project.imageUrl);
    return {
      ...project,
      imageUrl: seededLocalCover || PROJECT_COVERS[index % PROJECT_COVERS.length],
    };
  });
}

export function Projects({ galleryPage = false }: { galleryPage?: boolean }) {
  const { t, lang } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [page, setPage] = useState(1);
  // Homepage cards scroll in a Magic UI Marquee; the gallery page, and visitors
  // who prefer reduced motion, keep the static grid.
  const prefersReducedMotion = useReducedMotion();

  const loadProjects = useCallback(async () => {
    try {
      const items = await api.listProjects({ status: 'completed' });
      setProjects(withLocalProjectCovers(items.map(toProject)));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      setProjects(withLocalProjectCovers(sampleProjects.filter((project) => project.status === 'completed')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const visibleProjects = projects
    .filter((project) => !galleryPage || filter === 'all' || project.tone === filter)
    .filter((project) => {
      if (!galleryPage || !search.trim()) return true;
      const query = search.trim().toLocaleLowerCase();
      return [project.title, project.company, project.location]
        .map((value) => `${value.en} ${value.ar}`.toLocaleLowerCase())
        .some((value) => value.includes(query));
    });
  const pageCount = Math.max(1, Math.ceil(visibleProjects.length / 6));
  const displayedProjects = galleryPage
    ? visibleProjects.slice((page - 1) * 6, page * 6)
    : projects.slice(0, HOME_PROJECT_LIMIT);
  const useMarquee = !galleryPage && !prefersReducedMotion;
  const showingProjectTeaser = !galleryPage && !useMarquee && displayedProjects.length > 6;

  return (
    <section id="projects" aria-labelledby="projects-heading" className="section-y relative overflow-hidden bg-[#faf8f5]">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 end-[-10rem] h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="container-page relative">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow text-content-brand">{t('pr.eyebrow')}</p>
            <h2 id="projects-heading" className="mt-3 text-h1 text-content-primary">
              {galleryPage ? t('pr.galleryTitle') : t('pr.h2')}
            </h2>
            {galleryPage && <p className="readable-copy mt-3 text-body text-content-secondary">{t('pr.galleryIntro')}</p>}
          </div>
          {galleryPage && (
            <Button variant="secondary" size="md" onClick={() => { window.location.hash = paths.home; }}>
              {t('pr.backHome')}
            </Button>
          )}
        </Reveal>

        {galleryPage && (
          <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">{t('pr.search')}</span>
              <Icon name="search" size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-content-tertiary" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder={t('pr.search')}
                className="w-full rounded-xl border border-line-subtle bg-bg-surface py-3.5 ps-11 pe-4 text-body text-content-primary shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-500/15"
              />
            </label>
            <div className="flex flex-wrap gap-2" aria-label={t('pr.filter')}>
              {(['all', 'home', 'commercial', 'hybrid', 'agricultural'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => { setFilter(value); setPage(1); }}
                  className={`rounded-full border px-4 py-2 text-label-sm transition-colors ${
                    filter === value
                      ? 'border-amber-500 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'border-line-subtle bg-bg-surface text-content-secondary hover:border-amber-300 hover:bg-amber-50/70'
                  }`}
                >
                  {t(value === 'all' ? 'pr.filterAll' : value === 'home' ? 'pr.typeResidential' : value === 'commercial' ? 'pr.typeCommercial' : value === 'hybrid' ? 'pr.typeHybrid' : 'pr.typeAgricultural')}
                </button>
              ))}
            </div>
          </div>
        )}

        {unavailable && (
          <p role="status" className="mt-6 text-body-sm text-content-tertiary">{t('pr.loadError')}</p>
        )}
        {loading ? (
          <p role="status" className="mt-10 border-y border-line-subtle py-8 text-body text-content-secondary">
            {t('pr.loading')}
          </p>
        ) : displayedProjects.length === 0 ? (
          <p className="mt-10 border-y border-line-subtle py-8 text-body text-content-secondary">
            {search || filter !== 'all' ? t('pr.noMatches') : t('pr.empty')}
          </p>
        ) : useMarquee ? (
          // The track runs left-to-right in layout terms so the loop maths
          // holds in both languages; Arabic scrolls the other way (reverse),
          // and each card keeps the page's reading direction.
          <Marquee
            dir="ltr"
            pauseOnHover
            repeat={2}
            reverse={lang === 'ar'}
            data-testid="projects-marquee"
            className="relative mt-10 -mx-2 py-3 [--duration:70s] [--gap:1.25rem]"
          >
            {displayedProjects.map((project) => (
              <div key={project.id} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="w-[280px] shrink-0 sm:w-[320px] lg:w-[360px]">
                <ProjectCard project={project} onView={setSelectedProject} />
              </div>
            ))}
          </Marquee>
        ) : (
          <div className="relative mt-10">
            <ul id="projects-pocket" data-testid="projects-pocket" className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {displayedProjects.map((project, index) => (
                <li key={project.id} className={`relative h-full ${index >= 6 ? 'z-10' : 'z-30'}`}>
                  <ProjectCard project={project} onView={setSelectedProject} />
                </li>
              ))}
              {showingProjectTeaser && (
                <li
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-72 list-none bg-gradient-to-b from-transparent via-[#faf8f5]/80 to-[#faf8f5]"
                />
              )}
            </ul>
          </div>
        )}
        {!galleryPage && displayedProjects.length > 0 && (
          <div className="relative z-30 mt-6 flex w-full items-center justify-center">
            <Button
              variant="secondary"
              size="md"
              trailingArrow
              className="mx-auto flex cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-300 hover:from-amber-600 hover:to-amber-700 hover:shadow-amber-500/30"
              onClick={() => { window.location.hash = paths.projects; }}
            >
              {t('pr.viewAll')}
            </Button>
          </div>
        )}
        {galleryPage && pageCount > 1 && (
          <nav
            aria-label={lang === 'ar' ? 'صفحات المشاريع' : 'Project pages'}
            className="mt-8 flex items-center justify-center gap-4"
          >
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-line-subtle bg-bg-surface px-4 py-2 text-label text-content-secondary transition hover:border-amber-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              {lang === 'ar' ? 'السابق' : 'Previous'}
            </button>
            <span aria-live="polite" className="text-label-sm text-content-secondary">
              {lang === 'ar' ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}
            </span>
            <button
              type="button"
              disabled={page === pageCount}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-line-subtle bg-bg-surface px-4 py-2 text-label text-content-secondary transition hover:border-amber-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              {lang === 'ar' ? 'التالي' : 'Next'}
            </button>
          </nav>
        )}
      </div>
      {selectedProject && (
        <ProjectDetailDialog project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </section>
  );
}
