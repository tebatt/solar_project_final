import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';
import { Logo } from '../Logo';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { LanguageToggle } from '../ui/LanguageToggle';
import { navLinks } from '../../data/content';
import { useLanguage } from '../../i18n/LanguageProvider';
import { paths, useHashRoute } from '../../routes/useHashRoute';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useReducedMotion } from '../../motion/useReducedMotion';

const scrollSpySections = [
  { id: 'top', href: '#top' },
  { id: 'companies', href: '#companies' },
  { id: 'projects', href: '#projects' },
  { id: 'how-it-works', href: '#how-it-works' },
  { id: 'calculator', href: '#calculator' },
  { id: 'faq', href: paths.faq },
] as const;

/**
 * Sticky navigation.
 *
 * Desktop shows the full nav with the calculator flagged by a bolt chip.
 * Below `lg` it collapses to a disclosure menu: a real <button> with
 * aria-expanded/aria-controls, closed by Escape, and the trigger keeps a 44px
 * touch target. The language toggle stays visible at every width — it is the
 * first thing an Arabic-speaking visitor looks for.
 *
 * Sign-in opens the shared authentication modal; quote requests remain available to guests.
 */
export function Header() {
  const { t } = useLanguage();
  const { lang } = useLanguage();
  const prefersReduced = useReducedMotion();
  const { go } = useHashRoute();
  const { user, isLoading, openAuthModal, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeNavHref, setActiveNavHref] = useState('#top');
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const syncActiveNavigation = useCallback(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/')) {
      const route = hash.split('?')[0];
      setActiveNavHref(
        route.startsWith('#/companies') ? '#companies'
          : route === paths.projects ? '#projects'
            : route === paths.faq ? paths.faq
              : route === '#/calculator' ? '#calculator'
                : route === paths.requests ? paths.requests
                  : '#top',
      );
      return;
    }

    const matchingLink = [
      ...navLinks,
      { key: 'nav.calc' as const, href: '#calculator' },
      { key: 'nav.requests' as const, href: paths.requests },
      { key: 'nav.faq' as const, href: paths.faq },
    ].find((link) => link.href === hash);
    if (matchingLink) {
      setActiveNavHref(matchingLink.href);
      return;
    }

    const visibleSections = scrollSpySections
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null)
      .filter((section) => section.getBoundingClientRect().top <= 180);
    const activeSection = visibleSections[visibleSections.length - 1];
    const activeLink = scrollSpySections.find(({ id }) => id === activeSection?.id);
    setActiveNavHref(activeLink?.href ?? '#top');
  }, []);

  useEffect(() => {
    syncActiveNavigation();
    window.addEventListener('hashchange', syncActiveNavigation);
    if (typeof IntersectionObserver === 'undefined') {
      window.addEventListener('scroll', syncActiveNavigation, { passive: true });
    }
    return () => {
      window.removeEventListener('hashchange', syncActiveNavigation);
      window.removeEventListener('scroll', syncActiveNavigation);
    };
  }, [syncActiveNavigation]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sections = scrollSpySections
      .map(({ id, href }) => {
        const element = document.getElementById(id);
        return element ? { element, href } : null;
      })
      .filter((section): section is { element: HTMLElement; href: string } => section !== null);
    if (sections.length === 0) return;

    const activeSections = new Set<Element>();
    const hrefBySection = new Map<Element, string>(sections.map(({ element, href }) => [element, href]));
    const observer = new IntersectionObserver((entries) => {
      if (window.location.hash.startsWith('#/')) return;

      entries.forEach((entry) => {
        if (entry.isIntersecting) activeSections.add(entry.target);
        else activeSections.delete(entry.target);
      });

      const activationLine = 96;
      const visibleSections = [...activeSections]
        .map((element) => ({
          element,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ bounds }) => bounds.bottom > 0 && bounds.top < window.innerHeight);
      const activeSection = visibleSections.find(
        ({ bounds }) => bounds.top <= activationLine && bounds.bottom > activationLine,
      ) ?? visibleSections.sort(
        (a, b) => Math.abs(a.bounds.top - activationLine) - Math.abs(b.bounds.top - activationLine),
      )[0];

      if (activeSection) {
        const href = hrefBySection.get(activeSection.element);
        if (href) setActiveNavHref(href);
      }
    }, {
      rootMargin: '-80px 0px -70% 0px',
      threshold: 0,
    });

    sections.forEach(({ element }) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      setAccountOpen(false);
      setNotificationsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [notificationsOpen]);

  const notificationLabels = lang === 'ar'
    ? {
      title: 'الإشعارات',
      markAll: 'تحديد الكل كمقروء',
      empty: 'لا توجد إشعارات حتى الآن.',
      unread: 'غير مقروء',
    }
    : {
      title: 'Notifications',
      markAll: 'Mark all as read',
      empty: 'No notifications yet.',
      unread: 'Unread',
    };
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [accountOpen]);

  const accountDestination = user?.role === 'client'
    ? paths.requests
    : user?.role === 'admin'
      ? paths.admin
      : paths.company;
  const accountDestinationLabel = user?.role === 'client'
    ? t('nav.requests')
    : user?.role === 'admin'
      ? t('auth.adminDashboard')
      : t('auth.companyRequests');
  const accountRoleLabel = user
    ? {
        client: t('auth.roleClient'),
        company: t('auth.roleCompany'),
        admin: t('auth.roleAdmin'),
      }[user.role]
    : '';
  const accountInitial = user?.full_name.trim().charAt(0).toLocaleUpperCase() || '?';
  const showRequestCta = !isLoading && (!user || user.role === 'client');
  const requestCtaLabel = user?.role === 'client' ? t('cta.postProject') : t('cta.start');

  return (
    <header
      className={cn(
        'on-dark sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md transition-shadow',
        scrolled && 'shadow-panel',
      )}
    >
      <div className="container-page flex items-center gap-4 py-3.5 lg:gap-8 lg:py-4">
        <a href="#top" className="shrink-0 rounded-md" aria-label={t('a11y.logoHome')}>
          <Logo onDark />
        </a>

        {/* Desktop nav */}
        <nav aria-label="Main" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => {
              const active = activeNavHref === link.href;
              return (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative isolate inline-block whitespace-nowrap rounded-md px-2.5 py-2 text-label transition-colors duration-200',
                    active
                      ? 'text-content-on-dark'
                      : 'text-content-on-dark-muted hover:text-content-on-dark',
                  )}
                >
                  {active && (
                    <motion.span
                      aria-hidden="true"
                      layoutId="main-nav-active-background"
                      className="absolute inset-0 -z-10 rounded-md bg-bg-panel-raised"
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {t(link.key)}
                </a>
              </li>
              );
            })}
            <li>
              <a
                href="#calculator"
                aria-current={activeNavHref === '#calculator' ? 'page' : undefined}
                className={cn(
                  'relative isolate inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-label transition-colors duration-200',
                  activeNavHref === '#calculator'
                    ? 'text-content-on-dark'
                    : 'text-content-on-dark-muted hover:text-content-on-dark',
                )}
              >
                {activeNavHref === '#calculator' && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="main-nav-active-background"
                    className="absolute inset-0 -z-10 rounded-md bg-bg-panel-raised"
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                {t('nav.calc')}
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[var(--brand-subtle)] text-content-brand">
                  <Icon name="zap" size={13} />
                </span>
              </a>
            </li>
            <li>
              <a
                href={paths.requests}
                aria-current={activeNavHref === paths.requests ? 'page' : undefined}
                className={cn(
                  'relative isolate inline-block whitespace-nowrap rounded-md px-2.5 py-2 text-label transition-colors duration-200',
                  activeNavHref === paths.requests
                    ? 'text-content-on-dark'
                    : 'text-content-on-dark-muted hover:text-content-on-dark',
                )}
              >
                {activeNavHref === paths.requests && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="main-nav-active-background"
                    className="absolute inset-0 -z-10 rounded-md bg-bg-panel-raised"
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                {t('nav.requests')}
              </a>
            </li>
            <li>
              <a
                href={paths.faq}
                aria-current={activeNavHref === paths.faq ? 'page' : undefined}
                className={cn(
                  'relative isolate inline-block whitespace-nowrap rounded-md px-2.5 py-2 text-label transition-colors duration-200',
                  activeNavHref === paths.faq
                    ? 'text-content-on-dark'
                    : 'text-content-on-dark-muted hover:text-content-on-dark',
                )}
              >
                {activeNavHref === paths.faq && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="main-nav-active-background"
                    className="absolute inset-0 -z-10 rounded-md bg-bg-panel-raised"
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                {t('nav.faq')}
              </a>
            </li>
          </ul>
        </nav>

        <div className="relative ms-auto flex items-center gap-2 lg:gap-3">
          <LanguageToggle />

          {user && (user.role === 'client' || user.role === 'company') && (
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                aria-label={notificationLabels.title}
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
                onClick={() => setNotificationsOpen((value) => !value)}
                className="relative grid h-11 w-11 place-items-center rounded-md border border-line-on-dark bg-bg-panel-raised text-content-on-dark hover:bg-bg-panel"
              >
                <Icon name="bell" size={20} />
                {unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} ${notificationLabels.unread}`}
                    className="absolute -end-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--status-danger)] px-1 text-[0.65rem] font-bold text-white"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  aria-label={notificationLabels.title}
                  className="absolute end-0 top-full z-[60] mt-2 max-h-[min(75vh,32rem)] w-[min(24rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-line-subtle bg-bg-page p-4 text-content-primary shadow-xl"
                >
                  <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-1 pb-3">
                    <h2 className="text-base font-semibold">{notificationLabels.title}</h2>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="rounded-md px-2 py-1.5 text-sm text-content-brand transition-colors hover:bg-bg-subtle hover:underline"
                      >
                        {notificationLabels.markAll}
                      </button>
                    )}
                  </header>
                  {notifications.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-content-tertiary">{notificationLabels.empty}</p>
                  ) : (
                    <ul className="mt-2 grid gap-1">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <a
                            href={notification.href}
                            onClick={() => {
                              markRead(notification.id);
                              setNotificationsOpen(false);
                            }}
                            className={cn(
                              'block rounded-lg px-4 py-3.5 transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle',
                              !notification.read && 'border-s-2 border-line-brand bg-[var(--brand-subtle)]',
                            )}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span className="text-sm font-semibold text-content-primary">{notification.title}</span>
                              {!notification.read && (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--status-danger)]" />
                              )}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-content-secondary">{notification.body}</span>
                            <time dateTime={notification.created_at} className="mt-2 block text-body-xs text-content-tertiary">
                              {new Date(notification.created_at).toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-US')}
                            </time>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}

          {user ? (
            <div ref={accountRef} className="relative hidden sm:block">
              <button
                type="button"
                aria-label={`${t('auth.account')}: ${user.full_name}`}
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((value) => !value)}
                className="inline-flex max-w-56 items-center gap-2 rounded-lg border border-line-on-dark bg-bg-panel-raised px-3 py-2 text-label text-content-on-dark transition-colors hover:bg-bg-panel"
              >
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand-subtle)] text-content-brand">
                  {accountInitial}
                </span>
                <span className="truncate">{user.full_name}</span>
                <Icon name="chevron-down" size={16} />
              </button>
              {accountOpen && (
                <section
                  aria-label={t('auth.accountMenu')}
                  className="absolute end-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-line-subtle bg-bg-page p-5 text-content-primary shadow-xl"
                >
                  <div className="border-b border-line-subtle pb-4">
                    <p className="truncate text-base font-semibold">{user.full_name}</p>
                    <p className="mt-1 truncate text-sm text-content-secondary">{user.email}</p>
                    <span className="mt-2 inline-flex rounded-full bg-bg-subtle px-2.5 py-1 text-caption text-content-secondary">{accountRoleLabel}</span>
                  </div>
                  <a
                    href={accountDestination}
                    onClick={() => setAccountOpen(false)}
                    className="mt-2 block rounded-md px-4 py-3 text-base text-content-brand transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle"
                  >
                    {accountDestinationLabel}
                  </a>
                  <button
                    type="button"
                    onClick={() => { setAccountOpen(false); logout(); }}
                    className="mt-1 w-full rounded-md px-4 py-3 text-start text-base text-content-secondary transition-colors hover:bg-bg-subtle hover:text-content-primary focus-visible:bg-bg-subtle"
                  >
                    {t('auth.signOut')}
                  </button>
                </section>
              )}
            </div>
          ) : (
            isLoading
              ? <span role="status" aria-label={t('auth.loadingAccount')} className="hidden h-10 w-28 animate-pulse rounded-lg bg-bg-panel-raised sm:block" />
              : <Button variant="onDark" size="md" className="hidden whitespace-nowrap rounded-lg border-amber-200/30 bg-gradient-to-r from-white/10 to-white/[0.03] px-4 shadow-md shadow-amber-950/10 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-amber-200/60 hover:bg-white/10 hover:shadow-lg sm:inline-flex" onClick={() => openAuthModal()}>{t('cta.signin')}</Button>
          )}
          {showRequestCta && (
            <Button
              size="md"
              className="hidden whitespace-nowrap px-4 sm:inline-flex"
              onClick={() => go('request')}
            >
              {requestCtaLabel}
            </Button>
          )}

          <a
            href="#calculator"
            aria-label={t('a11y.calcShortcut')}
            className="grid h-11 w-11 place-items-center rounded-md bg-[var(--brand-subtle)] text-content-brand lg:hidden"
          >
            <Icon name="zap" size={20} />
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('a11y.menuClose') : t('a11y.menuOpen')}
            className="grid h-11 w-11 place-items-center rounded-md bg-bg-panel-raised text-content-on-dark lg:hidden"
          >
            <Icon name={open ? 'x-mark' : 'menu'} size={22} />
          </button>

        </div>
      </div>

      {/* Mobile disclosure */}
      <nav
        id="mobile-nav"
        aria-label="Main"
        hidden={!open}
        className="border-t border-line-on-dark bg-bg-inverse lg:hidden"
      >
        <ul className="container-page flex flex-col py-2">
          {[
            ...navLinks,
            { key: 'nav.calc' as const, href: '#calculator' },
            { key: 'nav.requests' as const, href: paths.requests },
            { key: 'nav.faq' as const, href: paths.faq },
          ].map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={activeNavHref === link.href ? 'page' : undefined}
                className={cn(
                  'relative isolate block rounded-md px-4 py-3 text-base transition-colors hover:bg-bg-panel-raised hover:text-content-on-dark focus-visible:bg-bg-panel-raised',
                  activeNavHref === link.href
                    ? 'text-content-on-dark'
                    : 'text-content-on-dark-muted',
                )}
              >
                {activeNavHref === link.href && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="mobile-nav-active-background"
                    className="absolute inset-0 -z-10 rounded-md bg-bg-panel-raised"
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                {t(link.key)}
              </a>
            </li>
          ))}
          <li className="mt-2 flex flex-col gap-3 border-t border-line-on-dark pb-2 pt-4 sm:hidden">
            {user ? (
              <>
                <div className="rounded-lg border border-line-on-dark bg-bg-panel-raised p-3">
                  <p className="truncate text-label text-content-on-dark">{user.full_name}</p>
                  <p className="mt-1 truncate text-body-sm text-content-on-dark-muted">{user.email}</p>
                  <span className="mt-2 inline-flex rounded-full bg-bg-inverse px-2.5 py-1 text-caption text-content-on-dark-muted">{accountRoleLabel}</span>
                </div>
                <a
                  href={accountDestination}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2 text-label text-content-on-dark-muted transition-colors hover:text-content-on-dark"
                >
                  {accountDestinationLabel}
                </a>
                <Button variant="onDark" size="md" fullWidth onClick={() => { setOpen(false); logout(); }}>
                  {t('auth.signOut')}
                </Button>
              </>
            ) : (
              isLoading
                ? <span role="status" className="h-10 animate-pulse rounded-lg bg-bg-panel-raised" aria-label={t('auth.loadingAccount')} />
                : <Button variant="onDark" size="md" fullWidth className="whitespace-nowrap rounded-lg border-amber-200/30 bg-gradient-to-r from-white/10 to-white/[0.03] shadow-md shadow-amber-950/10 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-amber-200/60 hover:bg-white/10 hover:shadow-lg" onClick={() => { setOpen(false); openAuthModal(); }}>{t('cta.signin')}</Button>
            )}
            {showRequestCta && (
              <Button
                size="md"
                fullWidth
                className="whitespace-nowrap"
                onClick={() => {
                  setOpen(false);
                  go('request');
                }}
              >
                {requestCtaLabel}
              </Button>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
}
