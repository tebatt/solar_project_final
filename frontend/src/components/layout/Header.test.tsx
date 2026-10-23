import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { NotificationsProvider } from '../../state/NotificationsContext';
import { Header } from './Header';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as null | {
      id: number;
      email: string;
      full_name: string;
      role: 'client' | 'company' | 'admin';
      phone: string | null;
      is_active: boolean;
      is_verified: boolean;
      company_id: number | null;
      created_at: string;
    },
    token: null as string | null,
    isLoading: false,
    openAuthModal: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../../state/AuthContext', () => ({
  useAuth: () => authState,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
beforeEach(() => {
  authState.user = null;
  authState.openAuthModal.mockReset();
  authState.logout.mockReset();
});

function renderHeader() {
  return render(
    <LanguageProvider>
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>
    </LanguageProvider>,
  );
}

describe('Header account navigation', () => {
  it('keeps sign-in available to guests', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'FAQ & Support' })).toHaveAttribute('href', '#/faq');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(authState.openAuthModal).toHaveBeenCalledOnce();
  });

  it('highlights the active page in desktop and mobile navigation', () => {
    window.location.hash = '#/faq';
    renderHeader();
    const faqLinks = document.querySelectorAll('nav[aria-label="Main"] a[href="#/faq"]');
    expect(faqLinks).toHaveLength(2);
    expect([...faqLinks].every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);

    window.location.hash = '#/projects';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getAllByRole('link', { name: 'Projects' }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('moves the active desktop tab as homepage sections intersect the scroll target', () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observedSections: Element[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: number[] = [];
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe(target: Element) { observedSections.push(target); }
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
    });
    const sectionIds = ['top', 'companies', 'projects', 'how-it-works', 'calculator', 'faq'];
    const sections = sectionIds.map((id) => {
      const section = document.createElement('section');
      section.id = id;
      document.body.append(section);
      return section;
    });

    try {
      renderHeader();
      expect(observedSections).toHaveLength(sectionIds.length);

      const companies = sections.find((section) => section.id === 'companies') as HTMLElement;
      vi.spyOn(companies, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 100, 510));
      const makeEntry = (target: HTMLElement, isIntersecting: boolean): IntersectionObserverEntry => ({
        target,
        isIntersecting,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      });
      act(() => intersectionCallback?.(
        [makeEntry(companies, true)],
        {} as IntersectionObserver,
      ));
      expect(within(document.querySelector('nav[aria-label="Main"]') as HTMLElement)
        .getByRole('link', { name: 'Solar Companies' })).toHaveAttribute('aria-current', 'page');

      const projects = sections.find((section) => section.id === 'projects') as HTMLElement;
      vi.spyOn(companies, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -500, 100, 400));
      vi.spyOn(projects, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 100, 510));
      act(() => intersectionCallback?.(
        [
          makeEntry(companies, false),
          makeEntry(projects, true),
        ],
        {} as IntersectionObserver,
      ));
      expect(within(document.querySelector('nav[aria-label="Main"]') as HTMLElement)
        .getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    } finally {
      sections.forEach((section) => section.remove());
    }
  });

  it.each([
    ['#top', 'Home'],
    ['#/companies?sort=verified', 'Solar Companies'],
    ['#/projects', 'Projects'],
    ['#how-it-works', 'How It Works'],
    ['#/calculator', 'Smart Energy Calculator'],
    ['#/requests?status=active', 'My Requests'],
    ['#/faq', 'FAQ & Support'],
  ])('highlights %s on the desktop navigation', (hash, label) => {
    window.location.hash = hash;
    renderHeader();

    const desktopNav = document.querySelector('nav[aria-label="Main"]');
    expect(within(desktopNav as HTMLElement).getByRole('link', { name: label }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('keeps desktop account and quote actions on one line', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('button', { name: 'Get Started' })).toHaveClass('whitespace-nowrap');
  });

  it.each([
    ['Get Started', false],
    ['Request a Quote', true],
  ])('opens a direct quote request from the %s header action', async (label, signedInClient) => {
    if (signedInClient) {
      authState.user = {
        id: 12,
        email: 'client@example.com',
        full_name: 'Solar Client',
        role: 'client',
        phone: null,
        is_active: true,
        is_verified: false,
        company_id: null,
        created_at: '2026-01-01T00:00:00Z',
      };
    }
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: label }));
    await vi.waitFor(() => expect(window.location.hash).toBe('#/request'));
  });

  it('includes FAQ and support in the mobile navigation', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.querySelector('#mobile-nav a[href="#/faq"]')).toHaveTextContent('FAQ & Support');
  });

  it('shows account identity, role-specific navigation, and sign-out after login', () => {
    authState.user = {
      id: 8,
      email: 'company@example.com',
      full_name: 'Blue Company',
      role: 'company',
      phone: null,
      is_active: true,
      is_verified: false,
      company_id: 8,
      created_at: '2026-01-01T00:00:00Z',
    };
    renderHeader();

    const trigger = screen.getByRole('button', { name: 'Account: Blue Company' });
    expect(trigger).toHaveTextContent('Blue Company');
    fireEvent.click(trigger);

    const accountMenu = within(screen.getByRole('region', { name: 'Account menu' }));
    expect(screen.getByRole('region', { name: 'Account menu' })).toHaveClass('w-[min(20rem,calc(100vw-2.5rem))]');
    expect(accountMenu.getByText('company@example.com')).toBeInTheDocument();
    expect(accountMenu.getByText('Company account')).toBeInTheDocument();
    expect(accountMenu.getByRole('link', { name: 'Company requests' })).toHaveAttribute('href', '#/company');
    fireEvent.click(accountMenu.getByRole('button', { name: 'Sign out' }));
    expect(authState.logout).toHaveBeenCalledOnce();
  });

  it('links client accounts to their requests instead of the company workspace', () => {
    authState.user = {
      id: 12,
      email: 'client@example.com',
      full_name: 'Solar Client',
      role: 'client',
      phone: null,
      is_active: true,
      is_verified: false,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    renderHeader();

    expect(screen.getByRole('button', { name: 'Request a Quote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get Started' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account: Solar Client' }));
    const accountMenu = within(screen.getByRole('region', { name: 'Account menu' }));
    expect(accountMenu.getByRole('link', { name: 'My Requests' })).toHaveAttribute('href', '#/requests');
    expect(accountMenu.queryByRole('link', { name: 'Company requests' })).not.toBeInTheDocument();
  });

  it('opens a spacious notification menu for signed-in clients', () => {
    authState.user = {
      id: 12,
      email: 'client@example.com',
      full_name: 'Solar Client',
      role: 'client',
      phone: null,
      is_active: true,
      is_verified: false,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const notificationsMenu = screen.getByRole('region', { name: 'Notifications' });
    expect(notificationsMenu).toHaveClass('w-[min(24rem,calc(100vw-2.5rem))]');
    expect(notificationsMenu).toHaveClass('shadow-xl');
    expect(within(notificationsMenu).getByText('No notifications yet.')).toBeInTheDocument();
  });

  it('routes administrators to a dedicated admin dashboard', () => {
    authState.user = {
      id: 1,
      email: 'admin@example.com',
      full_name: 'Platform Admin',
      role: 'admin',
      phone: null,
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Account: Platform Admin' }));
    expect(within(screen.getByRole('region', { name: 'Account menu' }))
      .getByRole('link', { name: 'Admin dashboard' })).toHaveAttribute('href', '#/admin');
  });
});
