import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import {
  IRAQI_MOBILE_PATTERN,
  isValidIraqiMobile,
  isValidSupportPhone,
  SUPPORT_PHONE_PATTERN,
} from '../../lib/supportPhone';
import { useLanguage } from '../../i18n/LanguageProvider';
import { useAuth, WrongAccountTypeError } from '../../state/AuthContext';
import { Button } from '../ui/Button';
import { Icon } from '../icons/Icon';
import { Input } from '../ui/Input';

type CompanyAuthMode = 'login' | 'register';

/** `#/company?register` opens the portal on the registration tab. */
export function companyAuthModeFromHash(hash = window.location.hash): CompanyAuthMode {
  const query = hash.split('?')[1] ?? '';
  return new URLSearchParams(query).has('register') ? 'register' : 'login';
}

/**
 * The company sign-in screen, shown on the company portal page.
 *
 * It is a separate door from the client pop-up, but both use the same account
 * system: the account type saved at registration decides what each person can
 * do. Client accounts are turned away here without starting a session.
 */
export function CompanyAuthForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const { login, registerCompany, openAuthModal, openClientRegistration } = useAuth();
  const [mode, setMode] = useState<CompanyAuthMode>(() => companyAuthModeFromHash());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const follow = () => {
      setMode(companyAuthModeFromHash());
      setError('');
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const text = {
    login: ar ? 'تسجيل الدخول' : 'Sign in',
    register: ar ? 'تسجيل شركة جديدة' : 'Register your company',
    submit: ar ? 'متابعة' : 'Continue',
    companyName: ar ? 'اسم الشركة' : 'Company name',
    founded: ar ? 'سنة التأسيس' : 'Founded year',
    phone: ar ? 'رقم الموبايل العراقي' : 'Iraqi Mobile Phone',
    supportPhone: ar ? 'رقم الدعم السريع للشركة' : 'Company Support Hotline',
    address: ar ? 'المحافظة والعنوان' : 'Governorate and address',
    email: ar ? 'البريد الإلكتروني' : 'Email address',
    password: ar ? 'كلمة المرور (10 أحرف على الأقل)' : 'Password (at least 10 characters)',
    optional: ar ? 'اختياري' : 'Optional',
    show: ar ? 'إظهار كلمة المرور' : 'Show password',
    hide: ar ? 'إخفاء كلمة المرور' : 'Hide password',
    forgot: ar ? 'نسيت كلمة المرور؟' : 'Forgot password?',
    verificationNote: ar
      ? 'كل شركة جديدة تبدأ "قيد التحقق". بعد التسجيل أكمل بيانات التوثيق حتى تستلم طلبات الزبائن.'
      : 'Every new company starts as pending. After registering, complete your verification details to receive customer requests.',
    clientDoor: ar ? 'تبحث عن منظومة لبيتك؟' : 'Looking for a system for your home?',
    clientDoorLink: ar ? 'سجّل أو ادخل كزبون' : 'Register or sign in as a client',
    clientAccount: ar
      ? 'هذا حساب زبون. بوابة الشركات لحسابات الشركات فقط، سجّل دخولك من صفحة الزبائن.'
      : 'This is a client account. The company portal is for company accounts only; sign in from the client page.',
    requiredFields: ar ? 'أكمل جميع الحقول المطلوبة.' : 'Complete all required fields.',
    invalidEmail: ar ? 'أدخل بريداً إلكترونياً صحيحاً.' : 'Enter a valid email address.',
    passwordShort: ar ? 'كلمة المرور لازم تكون 10 أحرف على الأقل.' : 'Password must be at least 10 characters.',
    nameShort: ar ? 'اسم الشركة قصير جداً.' : 'The company name is too short.',
    phoneInvalid: ar ? 'رقم الهاتف غير صحيح.' : 'The phone number is not valid.',
    foundedInvalid: ar ? 'سنة التأسيس غير صحيحة.' : 'The founded year is not valid.',
    invalidCredentials: ar ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Email or password is incorrect.',
    accountConflict: ar
      ? 'يوجد حساب يستخدم هذا البريد أو رقم الهاتف. جرّب تسجيل الدخول أو استخدم بيانات أخرى.'
      : 'An account already uses this email or phone. Try signing in or use different details.',
    serverUnreachable: ar ? 'تعذر الاتصال بالخادم. تأكد إنه شغّال وحاول مرة ثانية.' : 'Could not reach the server. Make sure it is running and try again.',
    genericError: ar ? 'صار خطأ. حاول مرة ثانية.' : 'Something went wrong. Please try again.',
  };

  const describeError = (cause: unknown): string => {
    if (cause instanceof WrongAccountTypeError) return text.clientAccount;
    const message = cause instanceof Error ? cause.message : '';
    if (cause instanceof ApiError) {
      if (cause.status === 0) return text.serverUnreachable;
      if (cause.status === 401) return text.invalidCredentials;
      if (cause.status === 409) return text.accountConflict;
    }
    if (message.includes('Email or password is incorrect')) return text.invalidCredentials;
    if (message.includes('already exists') || message.includes('already listed')) return text.accountConflict;
    return text.genericError;
  };

  const switchMode = (next: CompanyAuthMode) => {
    setMode(next);
    setShowPassword(false);
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) ?? '').trim();
    const email = value('email');
    const password = String(fields.get('password') ?? '');
    const companyName = value('company_name');
    const phone = value('phone');
    const supportPhone = value('support_phone');
    const foundedYear = value('founded_year');

    if (!email || !password || (mode === 'register' && (!companyName || !phone))) {
      setError(text.requiredFields);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(text.invalidEmail);
      return;
    }
    if (mode === 'register') {
      if (password.length < 10) return setError(text.passwordShort);
      if (companyName.length < 2) return setError(text.nameShort);
      if (!isValidIraqiMobile(phone) || (supportPhone && !isValidSupportPhone(supportPhone))) return setError(text.phoneInvalid);
      if (foundedYear) {
        const year = Number(foundedYear);
        if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return setError(text.foundedInvalid);
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        // Administrators also manage companies from this page.
        await login(email, password, { allowedRoles: ['company', 'admin'] });
      } else {
        await registerCompany({
          name: companyName,
          email,
          phone,
          support_phone: supportPhone,
          password,
          founded_year: foundedYear ? Number(foundedYear) : undefined,
          address: value('address') || undefined,
        });
      }
    } catch (cause) {
      setError(describeError(cause));
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

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))] p-6 text-white shadow-[0_24px_70px_-32px_rgba(2,6,23,0.9)] backdrop-blur-2xl sm:p-8">
      <div className="mb-5">
        <h2 className="text-h3 font-bold tracking-tight text-white">{mode === 'login' ? text.login : text.register}</h2>
        <p className="mt-2 text-body-sm text-slate-300">{ar ? 'بوابة آمنة لإدارة حساب شركتك وطلبات العملاء.' : 'A secure portal for your company account and customer requests.'}</p>
      </div>
      <div className="flex gap-2 rounded-xl border border-white/10 bg-slate-950/30 p-1" role="tablist">
        {(['login', 'register'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            onClick={() => switchMode(tab)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-label transition-all duration-200 ${mode === tab ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            {tab === 'login' ? text.login : text.register}
          </button>
        ))}
      </div>

      {mode === 'register' && (
        <p className="mt-5 rounded-xl border border-amber-200/20 bg-amber-300/[0.07] px-4 py-3 text-body-sm text-amber-100/90">{text.verificationNote}</p>
      )}
      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-body-sm text-rose-100">{error}</p>
      )}

      <form key={mode} className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit} onChange={() => setError('')} noValidate>
        {mode === 'register' && <>
          <Input appearance="glass" label={text.companyName} name="company_name" autoComplete="organization" required minLength={2} voiceGuide="الرجاء إدخال الاسم الرسمي لشركتك كما هو مثبت في السجل التجاري أو رخصة العمل." />
          <Input appearance="glass" label={text.founded} name="founded_year" type="number" autoComplete="off" min="1900" max={new Date().getFullYear()} optional optionalLabel={text.optional} voiceGuide="هذا الحقل اختياري. يرجى كتابة سنة تأسيس الشركة إن أردت." />
          <Input appearance="glass" label={text.phone} name="phone" type="tel" inputMode="numeric" autoComplete="tel" pattern={IRAQI_MOBILE_PATTERN} maxLength={11} placeholder="077 / 078 / 075 XXXXXXXX" required voiceGuide="أدخل رقم هاتفك النقال العراقي المؤلف من أحد عشر رقماً ويبدأ بالصفر سبعة." />
          <Input appearance="glass" label={text.supportPhone} name="support_phone" type="tel" inputMode="tel" autoComplete="off" pattern={SUPPORT_PHONE_PATTERN} maxLength={11} placeholder="07XXXXXXXXX or 6060" optional optionalLabel={text.optional} voiceGuide="هذا الحقل اختياري. أدخل رقم الخط الساخن أو رمز الدعم الخاص بشركتك." />
          <Input appearance="glass" label={text.address} name="address" autoComplete="off" optional optionalLabel={text.optional} voiceGuide="هذا الحقل اختياري. حدد المحافظة والعنوان الرئيسي لمقر شركتك." />
        </>}
        <Input appearance="glass" label={text.email} name="email" type="email" autoComplete={mode === 'login' ? 'username' : 'email'} required voiceGuide="أدخل بريدك الإلكتروني الرسمي الذي سيتم إرسال إشعارات المنظومات والعروض عليه." />
        <Input
          appearance="glass"
          label={text.password}
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'login' ? 1 : 10}
          endAdornment={passwordAdornment}
          voiceGuide="أدخل كلمة مرور قوية تتكون من أحرف وأرقام لضمان أمان حسابك."
        />
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <Button
            type="submit"
            loading={busy}
            className="rounded-xl !bg-gradient-to-r !from-amber-500 !via-amber-500 !to-amber-600 !text-slate-950 !shadow-lg !shadow-amber-500/20 transition-all duration-200 hover:!from-amber-400 hover:!to-amber-500 hover:!shadow-amber-500/30"
          >
            {text.submit}
          </Button>
          {mode === 'login' && (
            <button type="button" className="text-label-sm text-amber-400 underline decoration-amber-500/50 underline-offset-4 hover:text-amber-300" onClick={onForgotPassword}>{text.forgot}</button>
          )}
        </div>
      </form>

      <p className="mt-6 border-t border-white/10 pt-4 text-body-sm text-slate-300">
        {text.clientDoor}{' '}
        <button type="button" className="font-semibold text-amber-400 underline decoration-amber-500/50 underline-offset-4 hover:text-amber-300" onClick={() => (mode === 'register' ? openClientRegistration() : openAuthModal())}>{text.clientDoorLink}</button>
      </p>
    </div>
  );
}
