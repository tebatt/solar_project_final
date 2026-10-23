import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api, type ApiProject } from '../api/client';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { Projects } from './Projects';

vi.mock('../motion/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The homepage marquee's first track; the second is an aria-hidden copy for the loop. */
const marqueeTrack = () => document.querySelector('[data-testid="projects-marquee"] > div') as HTMLElement;

function renderProjects() {
  render(
    <LanguageProvider>
      <Projects />
    </LanguageProvider>,
  );
}

function makeApiProject(id: number): ApiProject {
  return {
    id,
    title: `Solar installation ${id}`,
    description: 'Completed rooftop installation',
    company_id: 1,
    company: {
      id: 1,
      name: 'Test Solar',
      logo_url: null,
      founded_year: 2015,
      projects_count: 10,
      address: 'Baghdad',
      verification_status: 'verified',
    },
    client_name: null,
    location_governorate: 'Baghdad',
    location_district: `District ${id}`,
    system_kwp: 8,
    battery_kwh: null,
    installation_type: 'On-grid rooftop',
    rating: 4.8,
    image_url: '',
    gallery_urls: [],
    status: 'completed',
    completed_at: `2026-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    created_at: `2026-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    panel_count: null,
    roof_type: null,
    inverter_details: null,
    annual_generation_kwh: null,
    testimonial: null,
  };
}

describe('Projects section request states', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listProjects').mockReturnValue(new Promise(() => {}));
  });

  it('announces loading while projects are being fetched', () => {
    renderProjects();
    expect(screen.getByRole('status')).toHaveTextContent('Loading completed projects…');
  });

  it('shows an empty state when the API has no completed projects', async () => {
    vi.mocked(api.listProjects).mockResolvedValue([]);
    renderProjects();

    expect(await screen.findByText('No completed projects are listed yet.')).toBeInTheDocument();
  });

  it('discloses API failure and falls back to bundled sample projects', async () => {
    vi.mocked(api.listProjects).mockRejectedValue(new Error('API unavailable'));
    renderProjects();

    expect(await screen.findByText('Live projects could not be loaded. Showing sample projects.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Residential Solar System' })).toBeInTheDocument();
  });

  it('shows nine featured projects and navigates to the full gallery from the CTA', async () => {
    window.location.hash = '';
    vi.mocked(api.listProjects).mockResolvedValue(Array.from({ length: 12 }, (_, index) => makeApiProject(index + 1)));
    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Solar installation 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /Solar installation/ })).toHaveLength(9);
    const viewAllButton = screen.getByRole('button', { name: 'View All Projects' });
    expect(document.querySelector('#projects')).toHaveClass('bg-[#faf8f5]');
    // Homepage cards run in a Magic UI Marquee: one real track plus a hidden copy for the loop.
    const marquee = document.querySelector('[data-testid="projects-marquee"]');
    expect(marquee).toHaveAttribute('dir', 'ltr');
    const tracks = [...(marquee?.children ?? [])];
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).not.toHaveAttribute('aria-hidden');
    expect(tracks[1]).toHaveAttribute('aria-hidden', 'true');
    expect(tracks[0]).toHaveClass('animate-marquee', 'group-hover:[animation-play-state:paused]');
    expect(tracks[0]).not.toHaveClass('[animation-direction:reverse]');
    expect(document.querySelector('#projects-pocket')).not.toBeInTheDocument();
    expect(viewAllButton.parentElement).toHaveClass('w-full', 'mt-6', 'relative', 'z-30');
    expect(viewAllButton).toHaveClass(
      'mx-auto',
      'px-8',
      'py-3.5',
      'bg-gradient-to-r',
      'from-amber-500',
      'to-amber-600',
      'text-sm',
      'font-bold',
      'rounded-xl',
      'shadow-amber-500/20',
      'hover:shadow-amber-500/30',
    );
    expect(marqueeTrack().children).toHaveLength(9);
    expect(document.querySelectorAll('#projects article [class*="via-[#faf8f5]"]')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Open full project gallery' })).not.toBeInTheDocument();
    fireEvent.click(viewAllButton);

    expect(screen.getAllByRole('heading', { name: /Solar installation/ })).toHaveLength(9);
    expect(window.location.hash).toBe('#/projects');
    expect(api.listProjects).toHaveBeenCalledTimes(1);
  });

  it('searches and filters projects on the full gallery page', async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      makeApiProject(1),
      { ...makeApiProject(2), title: 'Erbil commercial plant', system_kwp: 64 },
    ]);
    render(
      <LanguageProvider>
        <Projects galleryPage />
      </LanguageProvider>,
    );

    expect(await screen.findAllByRole('heading', { name: /Solar installation|Erbil commercial/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Commercial Facility' }));
    expect(screen.getByRole('heading', { name: 'Erbil commercial plant' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Solar installation 1' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nonexistent place' } });
    expect(await screen.findByText('No projects match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(window.location.hash).toBe('#/');
  });

  it('shows a verified project review directly on its public project card', async () => {
    vi.mocked(api.listProjects).mockResolvedValue([{
      ...makeApiProject(4),
      verified_review: {
        rating: 5,
        client_name: 'Ahmed M.',
        comment: 'The completed installation works exactly as agreed.',
        is_verified: true,
      },
      client_name: 'Ahmed M.',
      created_at: '2025-01-10T00:00:00Z',
    }]);
    renderProjects();

    await screen.findByRole('heading', { name: 'Solar installation 4' });
    const card = within(marqueeTrack());
    expect(card.getByText('The completed installation works exactly as agreed.')).toBeInTheDocument();
    expect(card.getByText('Ahmed M.')).toBeInTheDocument();
    expect(card.getByText('Verified Purchase')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Rated 5 out of 5' })).toBeInTheDocument();
    expect(card.getByText('Residential Solar')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solar array at Baghdad · District 4' })).toHaveAttribute(
      'src',
      '/projects/project_image/project_img1.jpeg',
    );
    expect(document.querySelector('#projects img[src*="contract"], #projects img[src*="agreement"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Project start date')).toBeInTheDocument();
    expect(screen.getByText('Completion date')).toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('The completed installation works exactly as agreed.')).toBeInTheDocument();
    expect(dialog.getByText('Verified Purchase')).toBeInTheDocument();
    expect(screen.getByText('Ahmed M. · Baghdad · District 4')).toBeInTheDocument();
    expect(document.querySelector('#projects img[src*="contract"], #projects img[src*="agreement"]')).not.toBeInTheDocument();
  });

  it('renders seeded project labels, categories, and supplied image paths', async () => {
    const seededProjects = [
      { title: 'نظام طاقة شمسية هجين 10KVA لحي الجامعة', category: 'residential' as const, system_size_label: '10 KVA / 16 Panels' },
      { title: 'منظومة طاقة شمسية صناعية 50kW لمصنع بلاستيك', category: 'commercial' as const, system_size_label: '50 kW / On-Grid' },
      { title: 'مشروع تشغيل مضخة مياه زراعية على الطاقة الشمسية', category: 'agricultural' as const, system_size_label: '25 HP Solar Pump' },
      { title: 'منظومة منزلية متكاملة 15KVA مع بطاريات ليثيوم', category: 'residential' as const, system_size_label: '15 KVA / 20kWh Lithium' },
      { title: 'مشروع إنارة شمسية مستقلة لمجمع تجاري', category: 'commercial' as const, system_size_label: '30 kW Hybrid' },
    ];
    vi.mocked(api.listProjects).mockResolvedValue(seededProjects.map((project, index) => ({
      ...makeApiProject(index + 1),
      ...project,
      image_url: `/projects/project_image/project_img${index + 1}.jpeg`,
    })));
    renderProjects();

    for (const project of seededProjects) {
      expect(await screen.findByRole('heading', { name: project.title })).toBeInTheDocument();
      expect(within(marqueeTrack()).getByText(project.system_size_label)).toBeInTheDocument();
    }
    expect(within(marqueeTrack()).getByText('Agricultural Solar')).toBeInTheDocument();
    expect([...marqueeTrack().querySelectorAll('img')].map((image) => image.getAttribute('src')))
      .toEqual(seededProjects.map((_, index) => `/projects/project_image/project_img${index + 1}.jpeg`));
  });

  it('paginates the project gallery in six-card pages', async () => {
    vi.mocked(api.listProjects).mockResolvedValue(Array.from({ length: 13 }, (_, index) => makeApiProject(index + 1)));
    render(
      <LanguageProvider>
        <Projects galleryPage />
      </LanguageProvider>,
    );

    expect(await screen.findAllByRole('button', { name: 'View Details' })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('button', { name: 'View Details' })).toHaveLength(6);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('button', { name: 'View Details' })).toHaveLength(1);
  });

  it('uses local featured covers instead of uploaded contract or agreement images', async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { ...makeApiProject(1), image_url: 'https://example.test/uploads/solar-array.jpg' },
      { ...makeApiProject(2), image_url: 'https://example.test/uploads/contract-agreement.jpg' },
    ]);
    renderProjects();

    expect(await screen.findByRole('img', { name: 'Solar array at Baghdad · District 1' })).toHaveAttribute(
      'src',
      '/projects/project_image/project_img1.jpeg',
    );
    expect(document.querySelector('img[src*="contract"]')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solar array at Baghdad · District 2' })).toHaveAttribute(
      'src',
      '/projects/project_image/project_img2.jpeg',
    );
  });

  it('shows nine featured projects and maps them to local cover images in sequence', async () => {
    vi.mocked(api.listProjects).mockResolvedValue(Array.from({ length: 12 }, (_, index) => makeApiProject(index + 1)));
    renderProjects();

    await screen.findByRole('heading', { name: 'Solar installation 1' });
    const images = [...marqueeTrack().querySelectorAll<HTMLImageElement>('img')];
    expect(images.map((image) => image.getAttribute('src'))).toEqual(
      Array.from({ length: 9 }, (_, index) => `/projects/project_image/project_img${index % 8 + 1}.jpeg`),
    );
    fireEvent.click(screen.getByRole('button', { name: 'View All Projects' }));
    expect(window.location.hash).toBe('#/projects');
    expect([...marqueeTrack().querySelectorAll<HTMLImageElement>('img')]
      .map((image) => image.getAttribute('src'))).toEqual(
        Array.from({ length: 9 }, (_, index) => `/projects/project_image/project_img${index % 8 + 1}.jpeg`),
      );
  });
});
