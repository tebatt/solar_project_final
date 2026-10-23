import { lazy, Suspense, useMemo } from 'react';
import { HomePage } from './pages/HomePage';
import { RequestQuotePage } from './pages/RequestQuotePage';
import { MyRequestsPage } from './pages/MyRequestsPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { CompanyPortalPage } from './pages/CompanyPortalPage';
import { PublicCompanyPage } from './pages/PublicCompanyPage';
import { CompaniesDirectoryPage } from './pages/CompaniesDirectoryPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { FAQPage } from './pages/FAQPage';
import { AuthModal } from './components/auth/AuthModal';
import { useHashRoute } from './routes/useHashRoute';
import { useLanguage } from './i18n/LanguageProvider';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { UtuAssistant } from './components/assessment/UtuAssistant';
import { useSolarEstimate } from './components/calculator/useSolarEstimate';
import { useCompanies } from './api/useCompanies';
import { useAssessment } from './state/AssessmentProvider';
import { buildInsight, buildTiers, companiesThatCanQuote } from './assessment/utuAssessment';
import type { Appliance } from './data/content';

const GreenInitiativeVerificationPage = lazy(() =>
  import('./pages/GreenInitiativeVerificationPage').then((module) => ({
    default: module.GreenInitiativeVerificationPage,
  })),
);

function GlobalUtuAssistant({ appliances }: { appliances: Appliance[] }) {
  const estimate = useSolarEstimate(appliances);
  const tiers = useMemo(() => buildTiers(estimate), [estimate]);
  const insight = useMemo(() => buildInsight(appliances, estimate), [appliances, estimate]);
  const { companies } = useCompanies();
  const companyCount = useMemo(
    () => companiesThatCanQuote(companies).length,
    [companies],
  );

  return (
    <UtuAssistant
      estimate={estimate}
      tier={tiers.balanced}
      insight={insight}
      companyCount={companyCount}
    />
  );
}

/**
 * Views picked off the hash.
 *
 * The skip link lives here rather than in each page so it is always the first
 * tab stop, whichever view is showing.
 */
export default function App() {
  const { t } = useLanguage();
  const { route, companyId, verificationId } = useHashRoute();
  const { appliances } = useAssessment();
  const showGlobalAssistant = route !== 'company' && route !== 'admin' && route !== 'assessment';

  return (
    <div className="w-full min-h-screen bg-[#faf8f5] overflow-x-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-bg-surface focus:px-4 focus:py-2.5 focus:text-label focus:text-content-primary focus:shadow-lg"
      >
        {t('a11y.skip')}
      </a>

      {route === 'request' && <RequestQuotePage />}
      {route === 'requests' && <MyRequestsPage />}
      {route === 'assessment' && <AssessmentPage />}
      {/* The company portal is its own door: it shows the company sign-in and
          registration screen itself, and turns client accounts away. */}
      {route === 'company' && <CompanyPortalPage />}
      {route === 'admin' && (
        <ProtectedRoute allowedRoles={['admin']}>
          <CompanyPortalPage />
        </ProtectedRoute>
      )}
      {route === 'companyDetails' && companyId !== null && <PublicCompanyPage companyId={companyId} />}
      {route === 'companyDirectory' && <CompaniesDirectoryPage />}
      {route === 'projects' && <ProjectsPage />}
      {route === 'reviews' && <ReviewsPage />}
      {route === 'faq' && <FAQPage />}
      {route === 'greenVerification' && verificationId !== null && (
        <Suspense fallback={<main role="status" className="container-page py-10">{t('green.loading')}</main>}>
          <GreenInitiativeVerificationPage verificationId={verificationId} />
        </Suspense>
      )}
      {route === 'home' && <HomePage />}
      {showGlobalAssistant && <GlobalUtuAssistant appliances={appliances ?? []} />}
      <AuthModal />
    </div>
  );
}
