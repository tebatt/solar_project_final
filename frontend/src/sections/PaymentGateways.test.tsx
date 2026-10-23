import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { PaymentGateways } from './PaymentGateways';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('PaymentGateways', () => {
  it('shows only the demo deposit methods and the no-real-charge disclosure in English', () => {
    render(
      <LanguageProvider>
        <PaymentGateways />
      </LanguageProvider>,
    );

    expect(screen.getByRole('heading', {
      name: 'Deposit methods in the demo',
    })).toBeInTheDocument();
    expect(screen.queryByText('Demo')).not.toBeInTheDocument();
    expect(screen.getByText('ZainCash')).toBeInTheDocument();
    expect(screen.getByText('FIB')).toBeInTheDocument();
    expect(screen.getByText('Qi Card')).toBeInTheDocument();
    const cards = screen.getByRole('list').querySelectorAll('li');
    expect(cards).toHaveLength(3);
    expect([...cards].every((card) => card.classList.contains('backdrop-blur-md')
      && card.classList.contains('border-white/10')
      && card.classList.contains('bg-slate-900/40')
      && card.classList.contains('hover:border-amber-500/40'))).toBe(true);
    expect([...screen.getByRole('list').querySelectorAll('svg')].every((icon) =>
      icon.querySelector('linearGradient') !== null)).toBe(true);
    // Only methods the backend accepts are listed.
    expect(screen.queryByText('آسيا حوالة')).not.toBeInTheDocument();
    expect(screen.queryByText(/Visa/)).not.toBeInTheDocument();
    expect(screen.getByText(/no real bank charge is made/i)).toBeInTheDocument();
  });

  it('localizes the banner and payment brands in Arabic', () => {
    localStorage.setItem('utu-lang', 'ar');
    render(
      <LanguageProvider>
        <PaymentGateways />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', {
      name: 'طرق دفع العربون في النسخة التجريبية',
    })).toBeInTheDocument();
    expect(screen.queryByText('عرض تجريبي')).not.toBeInTheDocument();
    expect(screen.getByText('زين كاش')).toBeInTheDocument();
    expect(screen.getByText('المصرف العراقي الأول')).toBeInTheDocument();
    expect(screen.getByText(/لا يتم تنفيذ خصم مصرفي حقيقي/)).toBeInTheDocument();
  });
});
