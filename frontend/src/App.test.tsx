import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { LanguageProvider } from './i18n/LanguageProvider';

const { state } = vi.hoisted(() => ({ state: { route: 'home' } }));

vi.mock('./routes/useHashRoute', () => ({
  useHashRoute: () => ({
    route: state.route,
    companyId: null,
    verificationId: null,
  }),
}));
vi.mock('./state/AssessmentProvider', () => ({ useAssessment: () => ({ appliances: [] }) }));
vi.mock('./api/useCompanies', () => ({ useCompanies: () => ({ companies: [] }) }));
vi.mock('./components/auth/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('./routes/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./pages/HomePage', () => ({ HomePage: () => <main /> }));
vi.mock('./pages/RequestQuotePage', () => ({ RequestQuotePage: () => <main /> }));
vi.mock('./pages/MyRequestsPage', () => ({ MyRequestsPage: () => <main /> }));
vi.mock('./pages/AssessmentPage', () => ({ AssessmentPage: () => <main /> }));
vi.mock('./pages/CompanyPortalPage', () => ({ CompanyPortalPage: () => <main /> }));
vi.mock('./pages/PublicCompanyPage', () => ({ PublicCompanyPage: () => <main /> }));
vi.mock('./pages/CompaniesDirectoryPage', () => ({ CompaniesDirectoryPage: () => <main /> }));

afterEach(cleanup);
beforeEach(() => {
  state.route = 'home';
  localStorage.removeItem('utu-lang');
});

function renderApp() {
  return render(
    <LanguageProvider>
      <div style={{ transform: 'translateX(40px)' }}>
        <App />
      </div>
    </LanguageProvider>,
  );
}

describe('global assistant placement', () => {
  it('shows a bottom-right floating assistant on public routes without calculator inputs', () => {
    renderApp();

    const assistantButton = screen.getByRole('button', { name: 'Ask UTU Assistant' });
    expect(assistantButton).toHaveClass(
      'fixed',
      'bottom-6',
      'right-6',
      'z-[9999]',
      'px-5',
      'py-3',
      'rounded-full',
      'bg-amber-500',
      'hover:bg-amber-400',
      'text-slate-950',
      'font-bold',
      'shadow-2xl',
      'shadow-amber-500/30',
      'flex',
      'items-center',
      'gap-2.5',
      'cursor-pointer',
      'transition-all',
      'duration-300',
      'hover:scale-105',
      'border',
      'border-amber-300/40',
    );
    expect(assistantButton).toHaveTextContent('Ask UTU Assistant');
    expect(assistantButton.parentElement).toBe(document.body);
    fireEvent.click(assistantButton);
    expect(screen.getByRole('dialog', { name: 'UTU assistant' })).toBeInTheDocument();
    expect(screen.getByText('Hello! I can help with common solar questions. Choose a topic below or type your own question.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What warranty is included?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How long does installation take?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How do deposits and payments work?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How do I maintain my system?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How do I choose the right system size?' })).toBeInTheDocument();
  });

  it.each(['company', 'admin'])('keeps the assistant off the %s portal', (route) => {
    state.route = route;
    renderApp();

    expect(screen.queryByRole('button', { name: 'Ask UTU Assistant' })).not.toBeInTheDocument();
  });

  it('shows the Arabic assistant label when Arabic is selected', () => {
    localStorage.setItem('utu-lang', 'ar');
    renderApp();

    expect(screen.getByRole('button', { name: 'استشر مساعد UTU الذكي' })).toHaveTextContent('استشر مساعد UTU الذكي');
  });
});
