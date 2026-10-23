import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { QuoteRequestProvider } from '../../state/QuoteRequestProvider';
import { AssessmentProvider } from '../../state/AssessmentProvider';
import { SolarCalculator } from './SolarCalculator';
import { StepSystem } from '../rfq/StepSystem';
import { CalculatorSection } from '../../sections/CalculatorSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

describe('SolarCalculator quote handoff', () => {
  it('shows the direct-request or smart-calculator choice banner', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })),
    );
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <CalculatorSection />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(screen.getByText(/You can fill in a request directly/)).toBeInTheDocument();
  });

  it('starts a new quote request pre-filled with the calculator result', async () => {
    localStorage.setItem('utu-quote-draft', JSON.stringify({ systemKWp: 20, panelCount: 30 }));
    localStorage.setItem('utu-quote-step', '4');
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <SolarCalculator />
            <StepSystem errors={{}} />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(screen.getByText('Nothing to size yet')).toBeInTheDocument();
    expect(screen.getByText('Split AC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load demo values' }));
    fireEvent.click(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' }));

    await waitFor(() => expect(window.location.hash).toBe('#/request'));
    const draft = JSON.parse(localStorage.getItem('utu-quote-draft') ?? '{}');
    expect(draft.fromCalculator).toBe(true);
    expect(draft.systemKWp).toBeGreaterThan(0);
    expect(draft.panelCount).toBeGreaterThan(0);
    expect(draft.calculatorDailyKWh).toBeGreaterThan(0);
    expect(draft.calculatorPeakAmps).toBeGreaterThan(0);
    // The old draft's numbers are replaced and the new request starts at step 1.
    expect(draft.systemKWp).not.toBe(20);
    expect(localStorage.getItem('utu-quote-step')).toBeNull();
    expect(await screen.findByText('Calculated daily consumption')).toBeInTheDocument();
    expect(screen.getByText('Estimated peak load equivalent')).toBeInTheDocument();
    expect(screen.getByLabelText('System size')).toHaveValue(draft.systemKWp);
  });

  it('offers a direct RFQ path while the calculator has no load and does not attach calculator data', async () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <SolarCalculator />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Skip calculator and submit a direct request/ }));

    await waitFor(() => expect(window.location.hash).toBe('#/request'));
    expect(localStorage.getItem('utu-quote-draft')).toBeNull();
  });

  it('lists standard appliances at zero and calculates immediately when a unit is activated', () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <SolarCalculator />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    expect(screen.getByText('Nothing to size yet')).toBeInTheDocument();
    expect(screen.getByText('Split AC')).toBeInTheDocument();
    expect(screen.getByText('Refrigerator / Freezer')).toBeInTheDocument();
    expect(screen.getByText('LED Lighting')).toBeInTheDocument();
    expect(screen.getByText('Television')).toBeInTheDocument();
    expect(screen.getByText('Water Pump')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }).length).toBeGreaterThan(1);
    expect(document.querySelectorAll('.on-dark.rounded-xl ul > li [role="status"]')).toHaveLength(10);
    expect(Array.from(document.querySelectorAll('.on-dark.rounded-xl ul > li [role="status"]'))
      .every((stepperValue) => stepperValue.textContent === '0')).toBe(true);
    expect(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' })).toBeDisabled();
    expect(document.querySelectorAll('.on-dark.rounded-xl ul > li p.numeric')).toHaveLength(5);
    expect(Array.from(document.querySelectorAll('.on-dark.rounded-xl ul > li p.numeric'))
      .every((dailyValue) => dailyValue.textContent?.trim() === '0 Wh')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Increase Split AC units' }));

    expect(screen.getByText('Equivalent Amperes / ما يعادل بالأمبير')).toBeInTheDocument();
    expect(screen.getByText('9,000 Wh')).toBeInTheDocument();
    expect(screen.getByText('6.5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add another appliance' }));
    expect(screen.getByText('Evaporative Cooler')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Increase Evaporative Cooler units' }));
    expect(screen.getByText('2,400 Wh')).toBeInTheDocument();
    expect(screen.getByText('7.8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Evaporative Cooler units' }));
    expect(screen.getByText('Evaporative Cooler').closest('li')?.querySelector('p.numeric'))
      .toHaveTextContent('0 Wh');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Evaporative Cooler' }));
    expect(screen.queryByText('Evaporative Cooler')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add another appliance' }));
    expect(screen.getByText('Evaporative Cooler')).toBeInTheDocument();
  });

  it('clears demo values and restores all default appliances to zero', () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <SolarCalculator />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load demo values' }));
    expect(screen.queryByText('Nothing to size yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByText('Nothing to size yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate My System & Request Quotes' })).toBeDisabled();
    expect(document.querySelectorAll('.on-dark.rounded-xl ul > li [role="status"]')).toHaveLength(10);
    expect(Array.from(document.querySelectorAll('.on-dark.rounded-xl ul > li [role="status"]'))
      .every((stepperValue) => stepperValue.textContent === '0')).toBe(true);
    expect(Array.from(document.querySelectorAll('.on-dark.rounded-xl ul > li p.numeric'))
      .every((dailyValue) => dailyValue.textContent?.trim() === '0 Wh')).toBe(true);
  });

  it('opens the UTU assessment with the same appliances', async () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <AssessmentProvider>
            <SolarCalculator />
          </AssessmentProvider>
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase Split AC units' }));
    fireEvent.click(screen.getByRole('button', { name: 'See UTU assessment' }));

    await waitFor(() => expect(window.location.hash).toBe('#/assessment'));
    const saved = JSON.parse(localStorage.getItem('utu-assessment-appliances') ?? '[]');
    expect(saved.length).toBeGreaterThan(0);
  });
});
