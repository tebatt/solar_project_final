import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContractDocument } from '../../api/client';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { ContractDocumentCard } from './ContractDocumentCard';

const contract: ContractDocument = {
  contract_id: 'UTU-TEST-42',
  customer_name: 'Test Customer',
  company_name: 'Sun Company',
  specifications: {
    system_kwp: 8.4,
    battery_kwh: 10,
    panel_count: 12,
    governorate: 'Baghdad',
    district: 'Al-Jadriya',
  },
  price_iqd: 10_000_000,
  installation_terms: { install_days: 5, warranty: '5 years' },
  signatures: {
    customer: 'Digitally accepted',
    company: 'Digitally agreed',
    platform_stamp: 'UTU DIGITAL AGREEMENT — DEMONSTRATION',
  },
};

describe('ContractDocumentCard', () => {
  afterEach(() => {
    cleanup();
    localStorage.removeItem('utu-lang');
  });

  it('renders the official Arabic agreement and offers a printable download in English site mode', () => {
    render(
      <LanguageProvider>
        <ContractDocumentCard contract={contract} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View contract document' }));

    expect(screen.getByRole('dialog', { name: 'وثيقة عقد اتفاق وتجهيز منظومة شمسية' })).toBeInTheDocument();
    expect(screen.getByText('جمهورية العراق / منصة أوتو (UTU) للطاقة الشمسية')).toBeInTheDocument();
    expect(screen.getByText('طرف أول (الشركة):')).toBeInTheDocument();
    expect(screen.getByText('UTU-TEST-42')).toBeInTheDocument();
    expect(screen.getByText('10,000,000 دينار عراقي')).toBeInTheDocument();
    expect(screen.getByText('Sun Company')).toBeInTheDocument();
    expect(screen.getByText('Test Customer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تحميل الوثيقة' })).toHaveAttribute('download', 'UTU-TEST-42.html');
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeInTheDocument();
    const html = decodeURIComponent(screen.getByRole('link', { name: 'تحميل الوثيقة' }).getAttribute('href') ?? '');
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('size:A4');
    expect(html).toContain('منصة أوتو - عقد معتمد وموثق رقمياً');
  });

  it('keeps the contract document Arabic when the site language is Arabic', () => {
    localStorage.setItem('utu-lang', 'ar');
    render(
      <LanguageProvider>
        <ContractDocumentCard contract={contract} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'عرض وثيقة العقد' }));

    expect(screen.getByRole('dialog', { name: 'وثيقة عقد اتفاق وتجهيز منظومة شمسية' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تحميل الوثيقة' })).toBeInTheDocument();
  });
});
