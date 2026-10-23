import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { api, type ApiCompany } from '../api/client';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { QuoteRequestProvider, useQuoteRequest } from '../state/QuoteRequestProvider';
import { RequestQuotePage } from './RequestQuotePage';
import { StepCompanies } from '../components/rfq/StepCompanies';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  localStorage.clear();
  localStorage.setItem('utu-quote-draft', JSON.stringify({
    systemKWp: 6.9,
    batteryKWh: 13.3,
    panelCount: 10,
    fromCalculator: false,
  }));
  localStorage.setItem('utu-quote-step', '0');
});

describe('RequestQuotePage', () => {
  it('shows companies in Arabic and lets the client select pending companies', async () => {
    const companies: ApiCompany[] = [
      {
        id: 101,
        name: 'Pending Solar',
        logo_url: null,
        founded_year: 2020,
        projects_count: 0,
        address: 'Baghdad',
        verification_status: 'pending',
        rating: 0,
        reviews_count: 0,
      },
      {
        id: 102,
        name: 'Identity-approved Solar',
        logo_url: null,
        founded_year: 2018,
        projects_count: 2,
        address: 'Basra',
        verification_status: 'identity_verified',
        rating: 4.2,
        reviews_count: 5,
      },
      {
        id: 103,
        name: 'Fully-approved Solar',
        logo_url: null,
        founded_year: 2015,
        projects_count: 8,
        address: 'Erbil',
        verification_status: 'verified',
        rating: 4.8,
        reviews_count: 12,
      },
    ];
    vi.spyOn(api, 'listCompanies').mockResolvedValue(companies);
    localStorage.setItem('utu-lang', 'ar');

    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <StepCompanies errors={{}} />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(await screen.findByText('Pending Solar')).toBeInTheDocument();
    expect(screen.getByText('Identity-approved Solar')).toBeInTheDocument();
    expect(screen.getByText('Fully-approved Solar')).toBeInTheDocument();
    expect(screen.getByText('قيد استكمال التوثيق')).toBeInTheDocument();
    expect(screen.getByText('هوية معتمدة')).toBeInTheDocument();
    expect(screen.getByText('شركة موثوقة رسمياً')).toBeInTheDocument();

    const pendingCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(pendingCheckbox);
    expect(pendingCheckbox).toBeChecked();
  });

  it('clears any unsent draft and starts at the first step with blank fields', async () => {
    localStorage.setItem('utu-quote-step', '2');
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <RequestQuotePage />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Confirm the system' })).toBeInTheDocument();
    expect(screen.getByLabelText('System size')).toHaveValue(null);
    expect(screen.getByLabelText('Battery capacity')).toHaveValue(null);
    expect(screen.getByLabelText('Number of panels')).toHaveValue(null);
    expect(screen.queryByText('Pre-filled from your calculator result')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Hybrid/ })).not.toBeChecked();
    expect(localStorage.getItem('utu-quote-draft')).toBeNull();
    expect(localStorage.getItem('utu-quote-step')).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('discards persisted calculator figures unless this visit came from a fresh calculator action', async () => {
    localStorage.setItem('utu-quote-draft', JSON.stringify({
      systemKWp: 6.9,
      batteryKWh: 13.3,
      panelCount: 10,
      calculatorDailyKWh: 28.4,
      calculatorPeakAmps: 24.7,
      fromCalculator: true,
    }));
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <RequestQuotePage />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(await screen.findByLabelText('System size')).toHaveValue(null);
    expect(screen.getByLabelText('Battery capacity')).toHaveValue(null);
    expect(screen.getByLabelText('Number of panels')).toHaveValue(null);
    expect(screen.queryByText('28.4 kWh / day')).not.toBeInTheDocument();
    expect(screen.queryByText('≈ 24.7 A')).not.toBeInTheDocument();
  });

  it('keeps figures handed off by an explicit calculator action for this RFQ visit', async () => {
    function CalculatorHandoff() {
      const { startFromSystem } = useQuoteRequest();
      const [openRequest, setOpenRequest] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              startFromSystem({
                systemKWp: 6.9,
                batteryKWh: 13.3,
                panelCount: 10,
                systemType: 'hybrid',
                dailyKWh: 28.4,
                peakLoadAmps: 24.7,
              });
              setOpenRequest(true);
            }}
          >
            Send calculator result to RFQ
          </button>
          {openRequest && <RequestQuotePage />}
        </>
      );
    }

    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <CalculatorHandoff />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send calculator result to RFQ' }));

    expect(await screen.findByLabelText('System size')).toHaveValue(6.9);
    expect(screen.getByText('28.4 kWh / day')).toBeInTheDocument();
    expect(screen.getByText('≈ 24.7 A')).toBeInTheDocument();
  });

  it('moves forward and back without losing entered values', () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <RequestQuotePage />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('System size'), { target: { value: '6.2' } });
    fireEvent.change(screen.getByLabelText('Number of panels'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Where is it going?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('System size')).toHaveValue(6.2);
    expect(screen.getByLabelText('Number of panels')).toHaveValue(9);
  });
});