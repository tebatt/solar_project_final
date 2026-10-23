import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteRequestGroup } from '../api/client';
import { buildInsight, buildTiers } from '../assessment/utuAssessment';
import { UtuAssistant } from '../components/assessment/UtuAssistant';
import type { SolarEstimate } from '../components/calculator/useSolarEstimate';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { FAQSection } from './FAQSection';

const mocks = vi.hoisted(() => ({
  myQuoteRequests: vi.fn(),
  auth: {
    user: null as null | { id: number; role: 'client' },
    isAuthenticated: false,
    isLoading: false,
  },
}));

vi.mock('../api/client', () => ({
  api: { myQuoteRequests: mocks.myQuoteRequests },
}));

vi.mock('../state/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(() => {
  mocks.myQuoteRequests.mockReset().mockResolvedValue([]);
  mocks.auth.user = null;
  mocks.auth.isAuthenticated = false;
  mocks.auth.isLoading = false;
});

const estimate: SolarEstimate = {
  dailyWh: 0,
  dailyKWh: 0,
  peakLoadAmps: 0,
  systemKWp: 0,
  batteryKWh: 0,
  panelCount: 0,
  outageHours: 0,
};

const projectRequest = (lifecycleStatus: string): QuoteRequestGroup[] => [{
  group_id: 'request-1',
  status: 'in_progress',
  created_at: '2025-01-01T00:00:00Z',
  customer_name: 'Customer',
  customer_phone: null,
  system_kwp: 5,
  battery_kwh: 10,
  panel_count: 10,
  details: {},
  companies: [{
    id: 1,
    company_id: 12,
    company_name: 'Al-Nour Solar',
    company_phone: '+964 770 123 4567',
    company_support_phone: null,
    company_email: 'contact@alnour.example',
    status: 'selected',
    quote: null,
    completed_projects: [],
    lifecycle_status: lifecycleStatus,
  }],
}];

function renderFaq() {
  return render(
    <LanguageProvider>
      <FAQSection />
    </LanguageProvider>,
  );
}

describe('FAQ and support', () => {
  it('shows only general platform support contacts to guests', () => {
    mocks.myQuoteRequests.mockResolvedValue(projectRequest('in_progress'));
    renderFaq();

    expect(screen.getByRole('heading', { name: 'FAQ & Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /UTU hotline.*6666/ })).toHaveAttribute('href', 'tel:6666');
    expect(screen.getByRole('link', { name: /support@utu-solar\.iq/ })).toHaveAttribute('href', 'mailto:support@utu-solar.iq');
    expect(screen.queryByText('+964 770 123 4567')).not.toBeInTheDocument();
    expect(mocks.myQuoteRequests).not.toHaveBeenCalled();
    const warranty = screen.getByText('What warranty will my solar system have?').closest('details');
    expect(warranty).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('What warranty will my solar system have?'));
    expect(warranty).toHaveAttribute('open');
  });

  it('uses Modern Standard Arabic for FAQ questions and assistant actions', () => {
    localStorage.setItem('utu-lang', 'ar');
    render(
      <LanguageProvider>
        <FAQSection />
        <UtuAssistant
          estimate={estimate}
          tier={buildTiers(estimate).balanced}
          insight={buildInsight([], estimate)}
          companyCount={0}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('ما هي الضمانات المشمولة مع منظومة الطاقة؟')).toBeInTheDocument();
    expect(screen.getByText('ما هي مراحل وإجراءات التركيب المعتمدة؟')).toBeInTheDocument();
    expect(screen.getByText('كيف يتم سداد الدفعة الأولى أو العربون عبر المنصة؟')).toBeInTheDocument();
    expect(screen.getByText('ما هي متطلبات الصيانة الدورية للألواح والبطاريات؟')).toBeInTheDocument();
    expect(screen.getByText('هل لديك استفسار خاص؟')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'استشر مساعد UTU الذكي' })).toHaveLength(2);
  });

  it('shows a company contact only for an authenticated client with an in-progress project', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    mocks.myQuoteRequests.mockResolvedValue(projectRequest('in_progress'));
    renderFaq();

    expect(await screen.findByRole('link', { name: /Al-Nour Solar.*\+964 770 123 4567/ })).toHaveAttribute(
      'href',
      'tel:+9647701234567',
    );
    expect(mocks.myQuoteRequests).toHaveBeenCalledOnce();
  });

  it('shows primary mobile and distinct support hotline for an executing company', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    const [request] = projectRequest('in_progress');
    request.companies[0].company_support_phone = '9999';
    mocks.myQuoteRequests.mockResolvedValue([request]);
    renderFaq();

    expect(await screen.findByRole('link', { name: /Company Direct Line.*\+964 770 123 4567/ })).toHaveAttribute(
      'href',
      'tel:+9647701234567',
    );
    expect(screen.getByRole('link', { name: /Company Support Hotline.*9999/ })).toHaveAttribute(
      'href',
      'tel:9999',
    );
    expect(screen.queryByRole('link', { name: /Company email/ })).not.toBeInTheDocument();
  });

  it('uses company email instead of duplicating primary mobile when no hotline is available', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    mocks.myQuoteRequests.mockResolvedValue(projectRequest('in_progress'));
    renderFaq();

    expect(await screen.findByRole('link', { name: /Company Direct Line.*\+964 770 123 4567/ })).toHaveAttribute(
      'href',
      'tel:+9647701234567',
    );
    expect(screen.getByRole('link', { name: /Company email.*contact@alnour\.example/ })).toHaveAttribute(
      'href',
      'mailto:contact@alnour.example',
    );
  });

  it('renders contacts once per unique executing company across multiple projects', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    const [firstProject] = projectRequest('in_progress');
    firstProject.companies[0].company_support_phone = '9999';
    const [secondProject] = projectRequest('in_progress');
    secondProject.group_id = 'request-2';
    const secondCompany = {
      ...secondProject.companies[0],
      id: 2,
      company_id: 24,
      company_name: 'Aya Solar',
      company_phone: '07722222222',
      company_support_phone: '6060',
      company_email: 'aya@example.com',
    };
    secondProject.companies = [
      { ...firstProject.companies[0], id: 3 },
      secondCompany,
    ];
    mocks.myQuoteRequests.mockResolvedValue([firstProject, secondProject]);
    renderFaq();

    await screen.findByRole('link', { name: /Company Support Hotline.*9999/ });
    expect(screen.getAllByRole('link', { name: /Company Direct Line.*\+964 770 123 4567/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Company Support Hotline.*9999/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Aya Solar.*07722222222/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Aya Solar.*6060/ })).toHaveLength(1);
  });

  it('does not reveal contacts for a project awaiting admin authorization', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    mocks.myQuoteRequests.mockResolvedValue(projectRequest('awaiting_admin_approval'));
    renderFaq();

    await waitFor(() => expect(mocks.myQuoteRequests).toHaveBeenCalledOnce());
    expect(screen.queryByText('+964 770 123 4567')).not.toBeInTheDocument();
  });

  it('shows the company contact for a verified completed project owned by the client', async () => {
    mocks.auth.user = { id: 4, role: 'client' };
    mocks.auth.isAuthenticated = true;
    const [request] = projectRequest('awaiting_signatures');
    request.companies[0].completed_projects = [{
      id: 21,
      title: 'Home solar installation',
      company_id: 12,
      company_name: 'Al-Nour Solar',
      system_kwp: 5,
      battery_kwh: 10,
      location_governorate: 'Baghdad',
      location_district: 'Karrada',
      completed_at: '2025-02-01T00:00:00Z',
      reviewed: false,
      status: 'completed',
    }];
    mocks.myQuoteRequests.mockResolvedValue([request]);
    renderFaq();

    expect(await screen.findByRole('link', { name: /Al-Nour Solar.*\+964 770 123 4567/ })).toHaveAttribute(
      'href',
      'tel:+9647701234567',
    );
  });

  it('opens the centered assistant and provides five answers without calculator data', () => {
    const tier = buildTiers(estimate).balanced;
    const insight = buildInsight([], estimate);
    render(
      <LanguageProvider>
        <FAQSection />
        <UtuAssistant estimate={estimate} tier={tier} insight={insight} companyCount={0} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Ask UTU Assistant' })[1]);
    const dialog = screen.getByRole('dialog', { name: 'UTU assistant' });
    expect(dialog).toHaveClass('m-auto');
    expect(dialog).toHaveClass('z-[10001]');

    const questions = [
      'What warranty is included?',
      'How long does installation take?',
      'How do deposits and payments work?',
      'How do I maintain my system?',
      'How do I choose the right system size?',
    ];
    for (const question of questions) {
      expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'How do I maintain my system?' }));
    expect(screen.getByText(/Keep panels clear of dust/)).toBeInTheDocument();
  });

  it('opens the assistant from the FAQ call to action and answers typed topics', () => {
    const tier = buildTiers(estimate).balanced;
    const insight = buildInsight([], estimate);
    render(
      <LanguageProvider>
        <FAQSection />
        <UtuAssistant estimate={estimate} tier={tier} insight={insight} companyCount={0} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Ask UTU Assistant' })[0]);
    expect(screen.getByRole('dialog', { name: 'UTU assistant' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ask a solar question'), {
      target: { value: 'What warranty comes with my solar panels?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));

    expect(screen.getByText('What warranty comes with my solar panels?')).toBeInTheDocument();
    expect(screen.getByText(/Warranty periods and coverage differ by equipment and installer/)).toBeInTheDocument();
  });
});
