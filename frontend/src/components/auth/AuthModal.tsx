import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../../api/client';
import { isValidIraqiMobile } from '../../lib/supportPhone';
import { AUTH_TOKEN_KEY, useAuth } from '../../state/AuthContext';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { TranslationKey } from '../../i18n/translations';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Icon } from '../icons/Icon';

export function AuthModal() {
  const {
    authModalOpen,
    authModalMode,
    closeAuthModal,
    login,
    registerClient,
    registerCompany,
    logout,
    user,
  } = useAuth();
  const { lang, t } = useLanguage();
  const ar = lang === 'ar';
  const [mode, setMode] = useState<'login' | 'register'>(authModalMode);
  const [accountType, setAccountType] = useState<'client' | 'company'>('client');
  const [showPassword, setShowPassword] = useState(false);
  const [loginFieldsUnlocked, setLoginFieldsUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | ''>('');
  const [businessRegisterFile, setBusinessRegisterFile] = useState<File | null>(null);
  const [taxRegistrationFile, setTaxRegistrationFile] = useState<File | null>(null);

  const text = {
    login: t('auth.login'),
    register: t('auth.register'),
    email: t('auth.email'),
    password: t('auth.password'),
    name: t('auth.fullName'),
    phone: t('auth.phone'),
    submit: t('auth.submit'),
    close: t('auth.close'),
    show: t('auth.showPassword'),
    hide: t('auth.hidePassword'),
    signedIn: t('auth.signedIn'),
    signOut: t('auth.signOut'),
    client: t('auth.client'),
    company: t('auth.company'),
    companyName: t('auth.companyName'),
    founded: t('auth.founded'),
    address: ar ? 'المقر الرئيسي — المحافظة والعنوان' : 'Primary headquarters — governorate and address',
    businessRegisterUpload: t('auth.businessRegisterUpload'),
    taxRegistrationUpload: t('auth.taxRegistrationUpload'),
    chooseFile: ar ? 'اختر ملفاً' : 'Choose file',
    documentUploadFailed: t('auth.documentUploadFailed'),
    companyProfileNote: t('auth.companyProfileNote'),
  };
  const roleLabel = {
    client: t('auth.roleClient'),
    company: t('auth.roleCompany'),
    admin: t('auth.roleAdmin'),
  };

  const localizedError = (cause: unknown): TranslationKey => {
    const message = cause instanceof Error ? cause.message : '';
    if (cause instanceof ApiError) {
      if (cause.status === 0) {
        return message.includes('timed out') ? 'auth.requestTimedOut' : 'auth.serverUnreachable';
      }
      if (cause.status === 401) return 'auth.invalidCredentials';
      if (cause.status === 409) return 'auth.accountConflict';
      if (cause.status === 422) return 'auth.invalidInput';
    }
    if (message === 'Not Found' || message.startsWith('404 ')) return 'auth.backendNotUpdated';
    if (message.includes('Email or password is incorrect')) return 'auth.invalidCredentials';
    if (message.includes('phone number already exists')) return 'auth.phoneExists';
    if (message.includes('email already exists') || message.includes('already listed')) return 'auth.emailExists';
    if (message.includes('valid email address')) return 'auth.invalidEmail';
    return 'auth.genericError';
  };

  useEffect(() => {
    setShowPassword(false);
    setError('');
    if (!authModalOpen) {
      setMode('login');
      setAccountType('client');
      setLoginFieldsUnlocked(false);
      setBusinessRegisterFile(null);
      setTaxRegistrationFile(null);
      return;
    }
    setMode(authModalMode);
    setAccountType('client');
    setLoginFieldsUnlocked(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authModalOpen, authModalMode, closeAuthModal]);

  useEffect(() => {
    if (!authModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [authModalOpen]);

  if (!authModalOpen) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get(mode === 'login' ? 'login_identifier' : 'email') ?? '').trim();
    const password = String(fields.get(mode === 'login' ? 'login_secret' : 'password') ?? '');
    const fullName = String(fields.get('full_name') ?? '').trim();
    const phone = String(fields.get('phone') ?? '').trim();
    const companyName = String(fields.get('company_name') ?? '').trim();
    const foundedYear = String(fields.get('founded_year') ?? '').trim();

    const isCompanyRegistration = mode === 'register' && accountType === 'company';
    if (!email || !password || (mode === 'register' && (!phone || (isCompanyRegistration ? !companyName : !fullName)))) {
      setError('auth.requiredFields');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('auth.invalidEmail');
      return;
    }
    if (mode === 'register' && password.length < 10) {
      setError('auth.passwordShort');
      return;
    }
    if (mode === 'register' && (isCompanyRegistration ? companyName.length : fullName.length) < 2) {
      setError('auth.nameShort');
      return;
    }
    if (mode === 'register' && !isValidIraqiMobile(phone)) {
      setError('auth.phoneInvalid');
      return;
    }
    if (isCompanyRegistration && foundedYear) {
      const year = Number(foundedYear);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
        setError('auth.foundedInvalid');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const signedIn = await login(email, password);
        // A company that signs in here is taken to its own portal.
        if (signedIn.role === 'company') window.location.hash = '#/company';
      } else if (accountType === 'company') {
        await registerCompany({
          name: companyName,
          email,
          password,
          phone,
          founded_year: foundedYear ? Number(foundedYear) : undefined,
          address: String(fields.get('address') ?? '').trim() || undefined,
        });
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        if (!token) {
          setError('auth.documentUploadFailed');
          return;
        }
        try {
          if (businessRegisterFile) {
            await api.uploadVerificationDocument(token, 'business_register', businessRegisterFile);
          }
          if (taxRegistrationFile) {
            await api.uploadVerificationDocument(token, 'tax', taxRegistrationFile);
          }
        } catch {
          setError('auth.documentUploadFailed');
          return;
        }
      } else {
        await registerClient({
          full_name: fullName,
          email,
          phone,
          password,
        });
      }
      closeAuthModal();
      setMode('login');
    } catch (cause) {
      setError(localizedError(cause));
    } finally {
      setBusy(false);
    }
  };

  const passwordAdornment = (
    <button
      type="button"
      aria-label={showPassword ? text.hide : text.show}
      title={showPassword ? text.hide : text.show}
      aria-pressed={showPassword}
      onClick={() => setShowPassword((current) => !current)}
      className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
    </button>
  );
  const companyRegistration = mode === 'register' && accountType === 'company';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuthModal(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="my-auto max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-300/25 bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))] p-6 text-white shadow-[0_32px_100px_-28px_rgba(2,6,23,0.9)] backdrop-blur-2xl sm:p-8"
      >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="auth-title" className="text-h3 font-bold tracking-tight text-white">{user ? text.signedIn : mode === 'login' ? text.login : text.register}</h2>
              {user && <p className="mt-1 text-body-sm text-slate-300">{user.full_name} · {roleLabel[user.role]}</p>}
            </div>
            <button type="button" aria-label={text.close} onClick={closeAuthModal} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"><Icon name="x-mark" /></button>
          </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-body-sm text-rose-100">{t(error)}</p>}
        {user ? (
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => { logout(); closeAuthModal(); }}>{text.signOut}</Button>
            {(user.role === 'company' || user.role === 'admin') && (
              <a href={user.role === 'admin' ? '#/admin' : '#/company'} onClick={closeAuthModal} className="inline-flex items-center rounded-md px-4 py-2 text-label text-content-brand underline">
                {user.role === 'admin' ? t('auth.adminDashboard') : t('auth.companyRequests')}
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-2 rounded-xl border border-white/10 bg-slate-950/30 p-1" role="tablist" aria-label={ar ? 'نوع الحساب' : 'Authentication mode'}>
              {(['login', 'register'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => { setMode(tab); setAccountType('client'); setShowPassword(false); setError(''); setBusinessRegisterFile(null); setTaxRegistrationFile(null); }} className={`flex-1 rounded-lg px-4 py-2.5 text-label transition-all duration-200 ${mode === tab ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                  {tab === 'login' ? text.login : text.register}
                </button>
              ))}
            </div>
            {mode === 'register' && (
              <div className="mt-4 flex gap-2 rounded-xl border border-white/10 bg-slate-950/30 p-1" role="tablist" aria-label={ar ? 'نوع الحساب الجديد' : 'New account type'}>
                {(['client', 'company'] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={accountType === tab} onClick={() => { setAccountType(tab); setShowPassword(false); setError(''); setBusinessRegisterFile(null); setTaxRegistrationFile(null); }} className={`flex-1 rounded-lg px-4 py-2 text-label transition-all duration-200 ${accountType === tab ? 'bg-white/10 text-amber-300 ring-1 ring-amber-500/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                    {text[tab]}
                  </button>
                ))}
              </div>
            )}
            <form
              key={`${mode}-${accountType}`}
              className={`mt-6 grid grid-cols-1 ${companyRegistration ? 'gap-x-6 gap-y-6 md:grid-cols-2' : 'gap-4 sm:grid-cols-2'}`}
              onSubmit={submit}
              onChange={() => setError('')}
              noValidate
              autoComplete="off"
            >
              {companyRegistration && (
                <p role="note" className="rounded-xl border border-amber-200/20 bg-amber-300/[0.07] px-4 py-3 text-body-sm text-amber-100/90 md:col-span-2">
                  {text.companyProfileNote}
                </p>
              )}
              {mode === 'register' && accountType === 'client' && <Input appearance="glass" label={text.name} name="full_name" autoComplete="name" required minLength={2} voiceGuide="أدخل اسمك الثلاثي الصريح والموثق." />}
              {mode === 'register' && accountType === 'company' && <>
                <Input appearance="glass" label={text.companyName} name="company_name" autoComplete="organization" required minLength={2} voiceGuide="الرجاء إدخال الاسم الرسمي لشركتك كما هو مثبت في السجل التجاري أو رخصة العمل." />
                <Input appearance="glass" label={text.founded} name="founded_year" type="number" min="1900" max={new Date().getFullYear()} voiceGuide="هذا الحقل اختياري. يرجى كتابة سنة تأسيس الشركة إن أردت." />
              </>}
              <Input
                appearance="glass"
                label={text.email}
                name={mode === 'login' ? 'login_identifier' : 'email'}
                type={mode === 'login' ? 'text' : 'email'}
                inputMode={mode === 'login' ? 'email' : undefined}
                autoComplete="off"
                readOnly={mode === 'login' && !loginFieldsUnlocked}
                onFocus={mode === 'login' ? () => setLoginFieldsUnlocked(true) : undefined}
                required
                voiceGuide="أدخل بريدك الإلكتروني الرسمي الذي سيتم إرسال إشعارات المنظومات والعروض عليه."
              />
              {mode === 'register' && accountType === 'client' && <Input appearance="glass" label={text.phone} name="phone" type="tel" inputMode="numeric" autoComplete="off" pattern="07[0-9]{9}" maxLength={11} required voiceGuide="أدخل رقم هاتفك النقال العراقي المؤلف من أحد عشر رقماً ويبدأ بالصفر سبعة." />}
              {companyRegistration && <Input appearance="glass" label={text.phone} name="phone" type="tel" inputMode="numeric" autoComplete="off" pattern="07[0-9]{9}" maxLength={11} required voiceGuide="أدخل رقم هاتفك النقال العراقي المؤلف من أحد عشر رقماً ويبدأ بالصفر سبعة." />}
              {companyRegistration && <Input appearance="glass" label={text.address} name="address" autoComplete="street-address" voiceGuide="هذا الحقل اختياري. حدد المحافظة والعنوان الرئيسي لمقر شركتك." />}
              <Input
                appearance="glass"
                label={text.password}
                name={mode === 'login' ? 'login_secret' : 'password'}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'off' : 'new-password'}
                readOnly={mode === 'login' && !loginFieldsUnlocked}
                onFocus={mode === 'login' ? () => setLoginFieldsUnlocked(true) : undefined}
                required
                minLength={mode === 'login' ? 1 : 10}
                endAdornment={passwordAdornment}
                voiceGuide="أدخل كلمة مرور قوية تتكون من أحرف وأرقام لضمان أمان حسابك."
              />
              {companyRegistration && <>
                <label className="grid gap-1.5 text-label-sm text-white">
                  <span>{text.businessRegisterUpload}</span>
                  <span className="relative flex min-h-12 items-center justify-between gap-3 overflow-hidden rounded-xl border border-amber-400/50 bg-[linear-gradient(135deg,rgba(120,83,24,0.96),rgba(71,48,14,0.98))] px-4 py-3 text-body-sm text-white shadow-[0_8px_24px_-12px_rgba(245,158,11,0.65)] transition-colors hover:border-amber-300 hover:from-amber-800 hover:to-yellow-950">
                    <span className="truncate">{businessRegisterFile?.name ?? text.chooseFile}</span>
                    <input
                      aria-label={text.businessRegisterUpload}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => setBusinessRegisterFile(event.target.files?.[0] ?? null)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </span>
                </label>
                <label className="grid gap-1.5 text-label-sm text-white">
                  <span>{text.taxRegistrationUpload}</span>
                  <span className="relative flex min-h-12 items-center justify-between gap-3 overflow-hidden rounded-xl border border-amber-400/50 bg-[linear-gradient(135deg,rgba(120,83,24,0.96),rgba(71,48,14,0.98))] px-4 py-3 text-body-sm text-white shadow-[0_8px_24px_-12px_rgba(245,158,11,0.65)] transition-colors hover:border-amber-300 hover:from-amber-800 hover:to-yellow-950">
                    <span className="truncate">{taxRegistrationFile?.name ?? text.chooseFile}</span>
                    <input
                      aria-label={text.taxRegistrationUpload}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => setTaxRegistrationFile(event.target.files?.[0] ?? null)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </span>
                </label>
              </>}
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button
                  type="submit"
                  loading={busy}
                  className="rounded-xl !bg-gradient-to-r !from-amber-500 !via-amber-500 !to-amber-600 !text-slate-950 !shadow-lg !shadow-amber-500/20 transition-all duration-200 hover:!from-amber-400 hover:!to-amber-500 hover:!shadow-amber-500/30"
                >
                  {text.submit}
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
