import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { QuoteRequestProvider } from '../../state/QuoteRequestProvider';
import { StepSite } from './StepSite';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('RFQ governorate selector', () => {
  it('uses the shared readable select and lists governorates', () => {
    render(
      <LanguageProvider>
        <QuoteRequestProvider>
          <StepSite errors={{}} />
        </QuoteRequestProvider>
      </LanguageProvider>,
    );

    const select = screen.getByRole('combobox', { name: 'Governorate' });
    expect(select).toHaveClass('platform-select', 'min-w-0', 'appearance-none');
    expect(screen.getByRole('option', { name: 'Choose a governorate' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Baghdad' })).toBeInTheDocument();
  });
});
