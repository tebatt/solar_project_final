import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { QuoteRequestProvider } from '../../state/QuoteRequestProvider';
import { StepContact } from './StepContact';

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock('../../state/AuthContext', () => ({ useAuth: mockUseAuth }));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  mockUseAuth.mockReset();
});

function renderStepContact() {
  return render(
    <LanguageProvider>
      <QuoteRequestProvider>
        <StepContact errors={{}} onEdit={() => undefined} />
      </QuoteRequestProvider>
    </LanguageProvider>,
  );
}

describe('StepContact phone field', () => {
  it('prefills and locks the signed-in client phone', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'client', phone: '07712345678' } });
    renderStepContact();

    expect(screen.getByLabelText('Phone number')).toHaveValue('07712345678');
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('readonly');
    expect(screen.getByText('Using your registered account phone number.')).toBeInTheDocument();
  });

  it('locks the field and asks clients without an account phone to add one', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'client', phone: null } });
    renderStepContact();

    expect(screen.getByLabelText('Phone number')).toHaveValue('');
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('readonly');
    expect(screen.getByText('Add a phone number to your profile before submitting a request.')).toBeInTheDocument();
  });

  it('keeps phone entry editable for guests', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderStepContact();

    expect(screen.getByLabelText('Phone number')).not.toHaveAttribute('readonly');
    expect(screen.getByText('Enter an Iraqi mobile number: exactly 11 digits starting with 07.')).toBeInTheDocument();
  });
});
