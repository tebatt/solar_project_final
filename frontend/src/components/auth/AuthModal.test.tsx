import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../api/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageProvider';
import { AuthProvider, AUTH_TOKEN_KEY, useAuth } from '../../state/AuthContext';
import { AuthModal } from './AuthModal';

vi.mock('../../api/client', () => ({
  api: {
    authMe: vi.fn(),
    authLogin: vi.fn(),
    authRegisterClient: vi.fn(),
    authRegisterCompany: vi.fn(),
    uploadVerificationDocument: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});
beforeEach(() => localStorage.clear());

function ModalHarness() {
  const { openAuthModal } = useAuth();
  const { setLang } = useLanguage();
  return (
    <>
      <button onClick={openAuthModal}>Open authentication</button>
      <button onClick={() => setLang('ar')}>العربية</button>
      <AuthModal />
    </>
  );
}

function renderModal() {
  return render(
    <LanguageProvider>
      <AuthProvider><ModalHarness /></AuthProvider>
    </LanguageProvider>,
  );
}

describe('AuthModal', () => {
  it('speaks detailed Fusha guidance for company registration fields in Arabic', () => {
    const speak = vi.fn();
    const arabicVoice = { lang: 'ar-SA', default: true } as SpeechSynthesisVoice;
    class MockUtterance {
      lang = '';
      rate = 1;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), resume: vi.fn(), getVoices: () => [arabicVoice], speak, onvoiceschanged: null });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Company' }));

    const prompts = [
      ['Company name', 'الرجاء إدخال الاسم الرسمي لشركتك كما هو مثبت في السجل التجاري أو رخصة العمل.'],
      ['Year founded', 'هذا الحقل اختياري. يرجى كتابة سنة تأسيس الشركة إن أردت.'],
      ['Email address', 'أدخل بريدك الإلكتروني الرسمي الذي سيتم إرسال إشعارات المنظومات والعروض عليه.'],
      ['Iraqi mobile (11 digits starting with 07)', 'أدخل رقم هاتفك النقال العراقي المؤلف من أحد عشر رقماً ويبدأ بالصفر سبعة.'],
      ['Primary headquarters — governorate and address', 'هذا الحقل اختياري. حدد المحافظة والعنوان الرئيسي لمقر شركتك.'],
      ['Password', 'أدخل كلمة مرور قوية تتكون من أحرف وأرقام لضمان أمان حسابك.'],
    ];

    for (const [fieldLabel, prompt] of prompts) {
      const field = screen.getByLabelText(fieldLabel).closest('div.flex.flex-col');
      expect(field).not.toBeNull();
      fireEvent.click(within(field as HTMLElement).getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }));
      expect(speak.mock.calls[speak.mock.calls.length - 1]?.[0]).toMatchObject({ text: prompt, lang: 'ar-SA' });
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Client' }));
    const fullNameField = screen.getByLabelText('Full name').closest('div.flex.flex-col');
    expect(fullNameField).not.toBeNull();
    fireEvent.click(within(fullNameField as HTMLElement).getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }));
    expect(speak.mock.calls[speak.mock.calls.length - 1]?.[0]).toMatchObject({
      text: 'أدخل اسمك الثلاثي الصريح والموثق.',
      lang: 'ar-SA',
    });
  });

  it('switches between client and company registration inside the modal', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));

    expect(screen.getByRole('tab', { name: 'Client' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Company' }));
    expect(screen.getByRole('tab', { name: 'Company' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog')).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('dialog')).toHaveClass(
      'max-h-[88vh]',
      'max-w-3xl',
      'backdrop-blur-2xl',
      'border-amber-300/25',
      'bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))]',
    );
    expect(screen.getByLabelText('Company name')).toBeRequired();
    expect(screen.getByRole('note')).toHaveTextContent(
      'You can complete your profile details and verification documents anytime from your company dashboard.',
    );
    expect(screen.getByLabelText(/Year founded/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Iraqi mobile/)).toBeRequired();
    expect(screen.getAllByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByLabelText('Company name').closest('div.flex.flex-col')).toHaveClass('[&_label]:!text-white');
    expect(screen.getByLabelText(/Year founded/).closest('div.flex.flex-col')).not.toHaveTextContent('Optional');
    expect(screen.getByLabelText(/Primary headquarters/).closest('div.flex.flex-col')).not.toHaveTextContent('Optional');
    expect(screen.getByLabelText('Company name').closest('div.flex.flex-col')).toHaveClass('[&_label]:!text-white');
    expect(screen.getByText(/Iraqi mobile/).closest('label')).not.toHaveTextContent('Optional');
    expect(screen.getByLabelText(/Primary headquarters/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Business license number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tax registration number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Completed projects/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Year founded/)).not.toBeRequired();
    expect(screen.getByLabelText(/Primary headquarters/)).not.toBeRequired();
    expect(screen.getByLabelText('Official Business License / Register Document (PDF or image)')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Official Business License / Register Document (PDF or image)')).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp');
    expect(screen.getByLabelText('Tax Registration Certificate (PDF or image)')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Official Business License / Register Document (PDF or image)')).toHaveClass('opacity-0');
    expect(screen.getByLabelText('Tax Registration Certificate (PDF or image)')).toHaveClass('opacity-0');
    expect(screen.getByLabelText('Email address')).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
    expect(screen.getByLabelText('Company name').closest('form')).toHaveClass('md:grid-cols-2');
    expect(screen.getByLabelText('Company name').closest('form')).toHaveClass('gap-x-6', 'gap-y-6');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Register or sign in on the company portal' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Client' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeRequired();
    expect(screen.getByLabelText('Email address')).toBeRequired();
    expect(screen.getByLabelText(/Iraqi mobile/)).toBeRequired();
    expect(screen.getByText(/Iraqi mobile/).closest('label')).not.toHaveTextContent('Optional');
    expect(screen.getByLabelText('Password')).toBeRequired();
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass(
      'border-amber-300/25',
      'bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))]',
    );
    expect(screen.getAllByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }).length).toBeGreaterThanOrEqual(4);
  });

  it('starts with blank fields and keeps passwords hidden unless explicitly shown', () => {
    renderModal();
    const previousOverflow = document.body.style.overflow;
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    const overlay = screen.getByRole('dialog').parentElement;
    expect(overlay).toHaveClass('fixed', 'inset-0', 'z-[100]', 'flex', 'items-center', 'justify-center');
    expect(screen.getByRole('dialog')).toHaveClass('max-h-[88vh]', 'overflow-y-auto');
    expect(screen.getByRole('dialog')).toHaveClass('max-w-3xl', 'border-amber-300/25', 'backdrop-blur-2xl');
    expect(screen.getByRole('dialog')).toHaveClass(
      'bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))]',
    );
    expect(screen.getAllByRole('button', { name: 'استمع إلى الإرشادات الصوتية' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toHaveClass('font-bold', 'text-white');
    expect(document.body.style.overflow).toBe('hidden');

    const email = screen.getByLabelText('Email address') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(email.parentElement).toHaveClass('!bg-white/[0.06]', 'focus-within:!border-amber-500');
    expect(email.closest('div.flex.flex-col')).toHaveClass('[&_label]:!text-white');
    expect(email).toHaveClass('text-slate-100', 'placeholder:text-slate-400');
    expect(email.value).toBe('');
    expect(email.autocomplete).toBe('off');
    expect(email.name).toBe('login_identifier');
    expect(email.readOnly).toBe(true);
    expect(password.value).toBe('');
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('off');
    expect(password.name).toBe('login_secret');
    expect(password.readOnly).toBe(true);

    fireEvent.focus(email);
    fireEvent.focus(password);
    expect(email.readOnly).toBe(false);
    expect(password.readOnly).toBe(false);

    fireEvent.change(password, { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.style.overflow).toBe(previousOverflow);
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));

    const reopenedPassword = screen.getByLabelText('Password') as HTMLInputElement;
    expect(reopenedPassword.value).toBe('');
    expect(reopenedPassword.type).toBe('password');
  });

  it('clears form values when changing between login and registration', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    expect(screen.getAllByRole('tab', { name: 'Create account' })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'saved@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'old-password' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));

    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass(
      'backdrop-blur-2xl',
      'bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))]',
      'border-amber-300/25',
    );
    expect(screen.getByLabelText('Full name').parentElement).toHaveClass('!bg-white/[0.06]');
    expect(screen.getByLabelText(/Iraqi mobile/)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeRequired();
    expect(screen.getByLabelText('Email address')).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('!from-amber-500', '!to-amber-600', '!shadow-amber-500/20');
    expect(screen.getByLabelText('Full name').closest('form')).toHaveClass('sm:grid-cols-2');
  });

  it('explains when the active backend does not expose auth endpoints', async () => {
    vi.mocked(api.authLogin).mockRejectedValue(new Error('Not Found'));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'client@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The authentication API was not found. Restart the backend from this project and try again.',
    );
  });

  it('shows localized invalid-credential feedback', async () => {
    vi.mocked(api.authLogin).mockRejectedValue(new Error('Email or password is incorrect'));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'client@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('البريد الإلكتروني أو كلمة المرور غير صحيحة.'));
  });

  it('shows a useful error when the backend reports a registration conflict', async () => {
    vi.mocked(api.authRegisterClient).mockRejectedValue(
      new ApiError('An account with this email or phone already exists', 409),
    );
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Client' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'client@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-client-password' } });
    fireEvent.change(screen.getByLabelText(/Iraqi mobile/), { target: { value: '07712345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account already uses this email or phone. Try signing in or use different details.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'يوجد حساب يستخدم هذا البريد أو رقم الهاتف. جرّب تسجيل الدخول أو استخدم بيانات أخرى.',
    ));
  });

  it('shows translated validation errors for missing required fields', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Complete all required fields.');
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('أكمل جميع الحقول المطلوبة.'));
  });

  it('requires an Iraqi mobile to register a company and accepts blank optional profile fields', async () => {
    const companyUser = {
      id: 8,
      email: 'solar@example.com',
      phone: '07712345678',
      full_name: 'Sun Company',
      role: 'company' as const,
      is_active: true,
      is_verified: false,
      company_id: 8,
      created_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(api.authRegisterCompany).mockResolvedValue({
      access_token: 'company-jwt',
      token_type: 'bearer',
      user: companyUser,
    });
    vi.mocked(api.authMe).mockResolvedValue(companyUser);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Company' }));
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Sun Company' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'solar@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-company-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Complete all required fields.');
    expect(api.authRegisterCompany).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Iraqi mobile/), { target: { value: '07712345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(api.authRegisterCompany).toHaveBeenCalledWith({
      name: 'Sun Company',
      email: 'solar@example.com',
      password: 'a-long-company-password',
      phone: '07712345678',
      founded_year: undefined,
      address: undefined,
    }));
  });

  it('takes a company that signs in from the client pop-up to its portal', async () => {
    const response = {
      access_token: 'company-jwt',
      token_type: 'bearer',
      user: {
        id: 2,
        email: 'solar@example.com',
        phone: '07712345678',
        full_name: 'Solar Company',
        role: 'company',
        is_active: true,
        is_verified: false,
        company_id: 8,
        created_at: '2026-01-01T00:00:00Z',
      },
    } as const;
    vi.mocked(api.authLogin).mockResolvedValue(response);
    vi.mocked(api.authMe).mockResolvedValue(response.user);
    window.location.hash = '#/';
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'solar@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-company-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(window.location.hash).toBe('#/company'));
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('company-jwt');
  });

  it('registers clients using the client endpoint and profile fields', async () => {
    const clientUser = {
      id: 3,
      email: 'client@example.com',
      phone: '07712345678',
      full_name: 'Test Client',
      role: 'client' as const,
      is_active: true,
      is_verified: false,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(api.authRegisterClient).mockResolvedValue({
      access_token: 'client-jwt',
      token_type: 'bearer',
      user: clientUser,
    });
    vi.mocked(api.authMe).mockResolvedValue(clientUser);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Client' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'client@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-client-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Complete all required fields.');
    expect(api.authRegisterClient).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Iraqi mobile/), { target: { value: '12345678901' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter an Iraqi mobile number with 11 digits starting with 07.',
    );
    expect(api.authRegisterClient).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Iraqi mobile/), { target: { value: '07712345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(api.authRegisterClient).toHaveBeenCalledWith({
      full_name: 'Test Client',
      email: 'client@example.com',
      phone: '07712345678',
      password: 'a-long-client-password',
    }));
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('client-jwt');
  });

  it('registers companies from the modal without verification-only text fields', async () => {
    const companyUser = {
      id: 8,
      email: 'solar@example.com',
      phone: '07712345678',
      full_name: 'Sun Company',
      role: 'company' as const,
      is_active: true,
      is_verified: false,
      company_id: 8,
      created_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(api.authRegisterCompany).mockResolvedValue({
      access_token: 'company-jwt',
      token_type: 'bearer',
      user: companyUser,
    });
    vi.mocked(api.uploadVerificationDocument).mockResolvedValue({
      company_id: 8,
      document_type: 'business_register',
      file_name: 'business-register.pdf',
      content_type: 'application/pdf',
      data_base64: 'JVBERi0xLjQ=',
    });
    vi.mocked(api.authMe).mockResolvedValue(companyUser);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open authentication' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Company' }));
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Sun Company' } });
    fireEvent.change(screen.getByLabelText(/Year founded/), { target: { value: '2017' } });
    fireEvent.change(screen.getByLabelText(/Iraqi mobile/), { target: { value: '07712345678' } });
    fireEvent.change(screen.getByLabelText(/Primary headquarters/), { target: { value: 'Baghdad' } });
    const businessRegister = new File(['business'], 'business-register.pdf', { type: 'application/pdf' });
    const taxCertificate = new File(['tax'], 'tax-certificate.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Official Business License / Register Document (PDF or image)'), { target: { files: [businessRegister] } });
    fireEvent.change(screen.getByLabelText('Tax Registration Certificate (PDF or image)'), { target: { files: [taxCertificate] } });
    expect((screen.getByLabelText('Official Business License / Register Document (PDF or image)') as HTMLInputElement).files?.[0]).toBe(businessRegister);
    expect((screen.getByLabelText('Tax Registration Certificate (PDF or image)') as HTMLInputElement).files?.[0]).toBe(taxCertificate);
    expect(screen.queryByLabelText(/Business license number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tax registration number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Completed projects/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'solar@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-company-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(api.authRegisterCompany).toHaveBeenCalledWith({
      name: 'Sun Company',
      email: 'solar@example.com',
      password: 'a-long-company-password',
      phone: '07712345678',
      founded_year: 2017,
      address: 'Baghdad',
    }));
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('company-jwt');
    await waitFor(() => {
      expect(api.uploadVerificationDocument).toHaveBeenNthCalledWith(1, 'company-jwt', 'business_register', businessRegister);
      expect(api.uploadVerificationDocument).toHaveBeenNthCalledWith(2, 'company-jwt', 'tax', taxCertificate);
    });
  });
});
