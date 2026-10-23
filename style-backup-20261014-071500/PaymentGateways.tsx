import { useLanguage } from '../i18n/LanguageProvider';
import { Icon } from '../components/icons/Icon';

/**
 * Methods offered in the deposit demo. Must match DepositPaymentCreate in the
 * backend (zaincash, fib, qi_card). No gateway is connected and the platform
 * has no agreement with these providers, so this is shown as a demo only.
 */
const gateways = [
  { id: 'zaincash', logo: 'ZainCash', name: { en: 'Mobile wallet', ar: 'زين كاش' }, icon: 'wallet' },
  { id: 'fib', logo: 'FIB', name: { en: 'Iraqi First Bank', ar: 'المصرف العراقي الأول' }, icon: 'building' },
  { id: 'qi-card', logo: 'QI', name: { en: 'Qi Card', ar: 'بطاقة Qi' }, icon: 'credit-card' },
] as const;

export function PaymentGateways() {
  const { lang } = useLanguage();
  const isArabic = lang === 'ar';

  return (
    <section
      aria-labelledby="payment-gateways-heading"
      className="on-dark section-y relative isolate overflow-hidden bg-slate-950"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(90deg, transparent, black 20%, black 80%, transparent)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(90vw,56rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl"
      />
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="payment-gateways-heading" className="mt-3 text-h2 text-content-on-dark">
            {isArabic
              ? 'طرق دفع العربون في النسخة التجريبية'
              : 'Deposit methods in the demo'}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-body-sm text-content-on-dark-muted">
            {isArabic
              ? 'هذه الخيارات للتجربة فقط: لا يوجد ربط مع أي بوابة دفع ولا يتم تنفيذ خصم مصرفي حقيقي.'
              : 'For demonstration only: no payment gateway is connected and no real bank charge is made.'}
          </p>
        </div>

        <ul className="mx-auto mt-8 grid max-w-5xl grid-cols-1 justify-items-center gap-4 sm:mt-10 sm:grid-cols-3">
          {gateways.map((gateway) => (
            <li
              key={gateway.id}
              className="flex min-h-20 w-full max-w-sm items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-4 text-center shadow-lg shadow-amber-500/5 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-amber-500/40 hover:shadow-amber-500/10"
            >
              <Icon name={gateway.icon} size={24} goldGradient className="shrink-0" />
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-start font-semibold text-transparent">
                <span className="block text-label">{gateway.logo}</span>
                <span className="mt-0.5 block text-label-sm">{gateway.name[lang]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
