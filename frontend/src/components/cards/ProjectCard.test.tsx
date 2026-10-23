import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { projects } from '../../data/content';
import { ProjectCard } from './ProjectCard';
import { ProjectDetailDialog } from './ProjectDetailDialog';

afterEach(cleanup);

const project = {
  ...projects[0],
  title: { en: 'Baghdad Home Array', ar: 'منظومة منزل بغداد' },
  size: '9.2 kWp',
  rating: 4.7,
  company: { en: 'Rafidain Solar Systems', ar: 'الرافدين للأنظمة الشمسية' },
};

function renderCard(onView = vi.fn()) {
  render(
    <LanguageProvider>
      <ProjectCard project={project} onView={onView} />
    </LanguageProvider>,
  );
  return onView;
}

describe('ProjectCard', () => {
  it('renders dynamic project content and rating', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Baghdad Home Array' })).toBeInTheDocument();
    expect(screen.getByText('9.2 kWp')).toBeInTheDocument();
    expect(screen.getByText('Rafidain Solar Systems')).toBeInTheDocument();
    expect(screen.getByLabelText('Rated 4.7 out of 5')).toBeInTheDocument();
    expect(screen.getByText('Residential Solar')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solar array at Baghdad · Al-Jadriya' })).toHaveAttribute(
      'src',
      '/projects/residential-baghdad.jpg',
    );
    expect(screen.getByRole('article')).toHaveClass('bg-[#faf8f5]', 'border-stone-200/80', 'shadow-sm');
    expect(screen.getByRole('article').querySelector('[class*="from-slate-100"], [class*="via-slate-200"]'))
      .not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toHaveClass(
      'bg-[#fef08a]/40',
      'text-[#a16207]',
      'border-[#eab308]/50',
      'backdrop-blur-md',
      'font-bold',
    );
    expect(screen.getByText('Completed').querySelector('svg')).toHaveClass('text-[#a16207]');
    expect(screen.getByText('Residential Solar')).toHaveClass(
      'bg-transparent',
      'text-[#a16207]',
      'underline',
      'decoration-[#eab308]/80',
      'font-bold',
    );
    expect(screen.getByRole('button', { name: 'View Details' }))
      .toHaveClass(
        'w-full',
        'py-2.5',
        'rounded-xl',
        '!bg-slate-900',
        '!text-slate-100',
        'text-sm',
        'border-slate-700/60',
        'hover:!bg-slate-800',
        'hover:border-amber-500/50',
        'hover:!text-amber-400',
        'group',
      );
    expect(screen.getByRole('button', { name: 'View Details' }).querySelector('svg'))
      .toHaveClass('group-hover:translate-x-1', 'transition-transform');
  });

  it('opens the project detail view when its action is selected', () => {
    const onView = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));

    expect(onView).toHaveBeenCalledWith(project);
  });

  it('shows the solar illustration when the project image fails to load', () => {
    renderCard();
    const image = screen.getByRole('img', { name: 'Solar array at Baghdad · Al-Jadriya' });

    fireEvent.error(image);

    expect(image).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solar array at Baghdad · Al-Jadriya' })).toHaveClass(
      'grid',
      'h-full',
      'w-full',
    );
  });

  it.each([
    ['pending', 'Pending'],
    ['draft', 'Draft'],
  ] as const)('shows the %s status without presenting the project as completed', (status, label) => {
    renderCardWithStatus(status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('keeps project and gallery URLs out of the project detail preview', () => {
    render(
      <LanguageProvider>
        <ProjectDetailDialog
          project={{ ...project, imageUrl: '/uploads/contract-agreement.jpg', galleryUrls: ['/uploads/agreement-document.png'] }}
          onClose={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole('dialog').querySelector('img[src*="agreement"], img[src*="contract"]')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solar array at Baghdad · Al-Jadriya' })).toHaveClass('bg-gradient-to-br');
    expect(screen.getByText('No customer review has been recorded for this project yet.')).toBeInTheDocument();
  });

  function renderCardWithStatus(status: 'pending' | 'draft') {
    render(
      <LanguageProvider>
        <ProjectCard project={{ ...project, status }} />
      </LanguageProvider>,
    );
  }
});