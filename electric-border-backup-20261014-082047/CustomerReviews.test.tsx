import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api, type ApiReview } from '../api/client';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { CustomerReviews } from './CustomerReviews';

vi.mock('../api/client', () => ({
  api: {
    publicReviews: vi.fn(),
  },
}));

vi.mock('../motion/Reveal', () => ({
  Reveal: ({ children, as: Element = 'div', className }: {
    children: ReactNode;
    as?: 'ul' | 'li' | 'div';
    className?: string;
  }) => <Element className={className}>{children}</Element>,
  RevealItem: ({ children, as: Element = 'div', className }: {
    children: ReactNode;
    as?: 'ul' | 'li' | 'div';
    className?: string;
  }) => <Element className={className}>{children}</Element>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const sampleReview: ApiReview = {
  id: 42,
  company_id: 3,
  company_name: 'Al-Nahrain Renewables',
  project_id: 7,
  project_title: 'Hybrid Solar System',
  system_kwp: 12.6,
  location_governorate: 'Basra',
  location_district: 'Al-Zubair',
  client_name: 'Basra Homeowner',
  rating: 4.8,
  communication_rating: 5,
  work_quality_rating: 5,
  comment: 'The battery backup makes evening outages much easier to manage.',
  is_verified: true,
  created_at: '2025-02-12T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(api.publicReviews).mockResolvedValue([sampleReview]);
});

describe('CustomerReviews', () => {
  it('renders verified review content and its linked project details', async () => {
    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText('The battery backup makes evening outages much easier to manage.')).toBeInTheDocument();
    expect(screen.getByText('Verified installation')).toBeInTheDocument();
    expect(screen.getByText('Hybrid Solar System')).toBeInTheDocument();
    expect(screen.getByText('Al-Nahrain Renewables')).toBeInTheDocument();
    expect(screen.getByText('Basra · Al-Zubair')).toBeInTheDocument();
    expect(screen.getByText(sampleReview.comment).closest('figure')).toHaveClass(
      'bg-white/70',
      'backdrop-blur-md',
      'border-stone-200/90',
      'rounded-2xl',
      'hover:-translate-y-1',
      'hover:border-amber-400/50',
    );
    expect(screen.getByText('Verified installation')).toHaveClass(
      'text-amber-800',
      'bg-amber-500/10',
      'border-amber-500/30',
      'inline-flex',
      'font-semibold',
      'shadow-[0_1px_1px_0_rgba(0,0,0,0.05)]',
    );
    expect(screen.getByText('Verified installation').querySelector('svg')).toHaveClass('text-amber-600');
    expect(screen.getByText('12.6 kWp system')).toHaveClass(
      '!bg-stone-100/90',
      '!text-slate-700',
      'border-stone-200',
    );
  });

  it('limits the homepage to nine reviews and links to the full reviews page', async () => {
    const submittedReviews = Array.from({ length: 12 }, (_, index) => ({
      ...sampleReview,
      id: index + 100,
      client_name: `Customer ${index + 1}`,
      comment: `Verified review comment ${index + 1}.`,
    }));
    vi.mocked(api.publicReviews).mockResolvedValue(submittedReviews);

    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText('Verified review comment 1.')).toBeInTheDocument();
    expect(document.querySelectorAll('#reviews figure')).toHaveLength(9);
    expect(document.querySelector('#reviews ul')).toHaveClass('lg:grid-cols-3');
    expect(document.querySelector('[aria-hidden="true"].bg-gradient-to-b')).not.toBeInTheDocument();
    const viewAll = screen.getByRole('button', { name: 'View All Reviews' });
    expect(viewAll).toHaveClass(
      'mx-auto',
      'mt-8',
      'px-8',
      'py-3.5',
      'bg-gradient-to-r',
      'from-amber-500',
      'to-amber-600',
      'hover:from-amber-600',
      'hover:to-amber-700',
      'text-slate-950',
      'font-bold',
      'text-sm',
      'rounded-xl',
      'shadow-amber-500/20',
      'hover:shadow-amber-500/30',
      'cursor-pointer',
    );
    fireEvent.click(viewAll);
    expect(window.location.hash).toBe('#/reviews');
  });

  it('shows only database reviews on the full reviews page', async () => {
    const submittedReviews = Array.from({ length: 12 }, (_, index) => ({
      ...sampleReview,
      id: index + 200,
      client_name: `Full page customer ${index + 1}`,
      comment: `Full page review ${index + 1}.`,
    }));
    vi.mocked(api.publicReviews).mockResolvedValue(submittedReviews);

    render(
      <LanguageProvider>
        <CustomerReviews fullPage />
      </LanguageProvider>,
    );

    expect(await screen.findByText('Full page review 1.')).toBeInTheDocument();
    expect(document.querySelectorAll('#reviews figure')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'View All Reviews' })).not.toBeInTheDocument();
  });

  it('shows newest verified database reviews without hardcoded sample reviews', async () => {
    const newestReview = {
      ...sampleReview,
      id: 78,
      client_name: 'Zaha K.',
      comment: 'The team completed my installation on time and answered every question.',
      created_at: '2026-10-06T00:00:00Z',
    };
    vi.mocked(api.publicReviews).mockResolvedValue([newestReview, sampleReview]);
    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText(newestReview.comment)).toBeInTheDocument();
    expect(screen.getByText(sampleReview.comment)).toBeInTheDocument();
    expect(screen.queryByText('Yousif A.')).not.toBeInTheDocument();
    expect(screen.queryByText('Zainab H.')).not.toBeInTheDocument();
    expect(screen.queryByText('Mustafa K.')).not.toBeInTheDocument();
    expect(api.publicReviews).toHaveBeenCalledOnce();
  });

  it('shows the empty state instead of sample reviews when the database has no reviews', async () => {
    vi.mocked(api.publicReviews).mockResolvedValue([]);
    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText('No verified reviews are available yet.')).toBeInTheDocument();
    expect(screen.queryByText('Yousif A.')).not.toBeInTheDocument();
  });

  it('does not display unverified database reviews unless the development preview is enabled', async () => {
    vi.mocked(api.publicReviews).mockResolvedValue([{ ...sampleReview, is_verified: false }]);
    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText('No verified reviews are available yet.')).toBeInTheDocument();
    expect(screen.queryByText(sampleReview.comment)).not.toBeInTheDocument();
  });

  it('shows an error without substituting mock reviews when the live feed fails', async () => {
    vi.mocked(api.publicReviews).mockRejectedValue(new Error('API unavailable'));
    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Live reviews could not be loaded. Please try again later.');
    expect(screen.queryByText('Yousif A.')).not.toBeInTheDocument();
    expect(screen.queryByText('The battery backup makes evening outages much easier to manage.')).not.toBeInTheDocument();
  });

  it('renders Arabic database seed reviews only when the development preview is enabled', async () => {
    vi.stubEnv('VITE_DEMO_REVIEW_PREVIEW_ENABLED', 'true');
    const seededReview: ApiReview = {
      ...sampleReview,
      id: 73,
      client_name: 'أحمد الفتلاوي',
      project_title: 'منظومة منزلية هجينة - بغداد، الكرادة',
      comment: 'بيانات توضيحية: الخدمة ممتازة والتنصيب تم في الموعد المحدد.',
      is_verified: false,
      is_demo: true,
    };
    vi.mocked(api.publicReviews).mockResolvedValue([seededReview]);

    render(
      <LanguageProvider>
        <CustomerReviews />
      </LanguageProvider>,
    );

    expect(await screen.findByText('الخدمة ممتازة والتنصيب تم في الموعد المحدد.')).toBeInTheDocument();
    expect(screen.getByText('Illustrative data')).toBeInTheDocument();
    expect(screen.queryByText('بيانات توضيحية:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Development preview/)).not.toBeInTheDocument();
    expect(screen.queryByText('Verified installation')).not.toBeInTheDocument();
    expect(api.publicReviews).toHaveBeenCalledWith(true);
  });
});