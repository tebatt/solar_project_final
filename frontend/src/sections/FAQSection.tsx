import { useEffect, useState } from 'react';
import { api, type QuoteRequestGroup } from '../api/client';
import { Icon } from '../components/icons/Icon';
import { useLanguage } from '../i18n/LanguageProvider';
import { useAuth } from '../state/AuthContext';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'support@utu-solar.iq';

const FAQ = {
  en: [
    {
      question: 'What warranty will my solar system have?',
      answer: 'Warranty periods depend on the panels, inverter, batteries, and installer. Ask the company to document each warranty, its coverage, and the claim process in your contract before accepting the quote.',
    },
    {
      question: 'How does the installation process work?',
      answer: 'Submit a request, compare company quotes, and agree on a site inspection, equipment list, schedule, and contract. Installation should begin after the required contract approvals.',
    },
    {
      question: 'How does the deposit work?',
      answer: 'The deposit amount and timing are governed by the accepted quote and contract. Any payment methods currently shown in this demo are simulated and do not charge real money.',
    },
    {
      question: 'What maintenance do solar panels need?',
      answer: 'Follow the installer and manufacturer guidance for safe panel cleaning and inspection. Keep an eye on inverter alerts and arrange servicing if you notice a change in system output.',
    },
  ],
  ar: [
    {
      question: 'ما هي الضمانات المشمولة مع منظومة الطاقة؟',
      answer: 'تختلف مدة الضمان وتغطيته باختلاف الألواح والعاكس والبطاريات والشركة المنفذة. اطلب توثيق الضمانات وشروطها وآلية المطالبة بها في العقد قبل قبول العرض.',
    },
    {
      question: 'ما هي مراحل وإجراءات التركيب المعتمدة؟',
      answer: 'قدّم طلباً، وقارن عروض الشركات، ثم اتفق على موعد المعاينة الميدانية وقائمة المعدات والجدول الزمني والعقد. يبدأ التنفيذ بعد استكمال الموافقات المطلوبة على العقد.',
    },
    {
      question: 'كيف يتم سداد الدفعة الأولى أو العربون عبر المنصة؟',
      answer: 'يحدد العرض المقبول والعقد مبلغ الدفعة الأولى وموعد سدادها. وسائل الدفع المعروضة حالياً لأغراض تجريبية فقط، ولا تنفذ أي خصم مالي حقيقي.',
    },
    {
      question: 'ما هي متطلبات الصيانة الدورية للألواح والبطاريات؟',
      answer: 'اتبع إرشادات الشركة المصنّعة لتنظيف الألواح وفحصها بأمان، وراقب تنبيهات العاكس وحالة البطاريات، والتزم بجدول الصيانة الموصى به.',
    },
  ],
} as const;

export function FAQSection() {
  const { lang, t } = useLanguage();
  const { user, isAuthenticated, isLoading } = useAuth();
  const questions = FAQ[lang];
  const [requests, setRequests] = useState<QuoteRequestGroup[]>([]);
  const [contactsError, setContactsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRequests([]);
    setContactsError(false);
    if (isLoading || !isAuthenticated || user?.role !== 'client') return;

    api.myQuoteRequests()
      .then((groups) => {
        if (!cancelled) setRequests(groups);
      })
      .catch((error: unknown) => {
        console.warn('[utu] could not load authorized project contacts:', error);
        if (!cancelled) setContactsError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, user?.id, user?.role]);

  const projectContactsByCompany = requests.flatMap((request) =>
    request.companies.flatMap((company) => {
      const lifecycleActive = company.lifecycle_status === 'in_progress';
      const verifiedCompleted = company.lifecycle_status === 'approved'
        || company.completed_projects?.some((project) => project.company_id === company.company_id);
      if (
        (!lifecycleActive && !verifiedCompleted)
        || (!company.company_phone && !company.company_support_phone && !company.company_email)
      ) {
        return [];
      }
      return [{
        companyId: company.company_id,
        id: String(company.company_id),
        name: company.company_name || (lang === 'ar' ? 'الشركة المنفذة' : 'Executing company'),
        primaryPhone: company.company_phone,
        secondaryContact: company.company_support_phone || company.company_email,
        secondaryIsEmail: !company.company_support_phone && Boolean(company.company_email),
      }];
    }),
  );
  const projectContacts = Array.from(
    new Map(projectContactsByCompany.map((contact) => [contact.companyId, contact])).values(),
  );

  return (
    <section id="faq" aria-labelledby="faq-heading" className="section-y relative isolate overflow-hidden bg-bg-page">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 end-[-8rem] -z-10 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="container-page">
        <header className="mx-auto max-w-3xl text-center">
          <p className="eyebrow text-amber-700">{t('faq.eyebrow')}</p>
          <h1 id="faq-heading" className="mt-3 text-h1 text-content-primary">{t('faq.title')}</h1>
          <p className="readable-copy mt-4 text-body-lg text-content-secondary">{t('faq.intro')}</p>
        </header>

        <section aria-labelledby="faq-contact-heading" className="mx-auto mt-10 max-w-5xl rounded-2xl border border-line-subtle bg-bg-surface p-5 shadow-lg shadow-slate-900/5 sm:p-7">
          <div className="mb-5">
            <h2 id="faq-contact-heading" className="text-h3 text-content-primary">{t('faq.contactTitle')}</h2>
            <p className="mt-1 text-body-sm text-content-secondary">{t('faq.contactIntro')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <a href="tel:6666" className="group flex h-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 transition hover:border-amber-400 hover:bg-amber-50">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Icon name="phone" size={20} /></span>
                <span>
                  <span className="block text-label-sm text-content-tertiary">{t('faq.hotline')}</span>
                  <span className="numeric mt-1 block text-h4 text-content-primary">6666</span>
                </span>
              </a>
            </li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex h-full items-center gap-3 rounded-xl border border-line-subtle p-4 transition hover:border-amber-300 hover:bg-amber-50/50">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-800"><Icon name="mail" size={20} /></span>
                <span className="min-w-0">
                  <span className="block text-label-sm text-content-tertiary">{t('faq.email')}</span>
                  <span className="mt-1 block truncate text-label text-content-primary">{SUPPORT_EMAIL}</span>
                </span>
              </a>
            </li>
          </ul>
          {contactsError && (
            <p role="status" className="mt-4 text-body-sm text-content-tertiary">{t('faq.contactsUnavailable')}</p>
          )}
          {projectContacts.length > 0 && (
            <section aria-label={t('faq.projectContacts')} className="mt-6 border-t border-line-subtle pt-5">
              <h3 className="text-label font-semibold text-content-primary">{t('faq.projectContacts')}</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {projectContacts.map((contact) => (
                  <li key={contact.id} className="grid gap-3">
                    {contact.primaryPhone && (
                      <a href={`tel:${contact.primaryPhone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 rounded-xl border border-line-subtle p-4 transition hover:border-amber-300 hover:bg-amber-50/50">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-800"><Icon name="phone" size={20} /></span>
                        <span className="min-w-0">
                          <span className="block text-label-sm text-content-tertiary">{contact.name} · {t('faq.primaryMobile')}</span>
                          <span className="numeric mt-1 block truncate text-label text-content-primary" dir="ltr">{contact.primaryPhone}</span>
                        </span>
                      </a>
                    )}
                    {contact.secondaryContact && (
                      <a
                        href={contact.secondaryIsEmail
                          ? `mailto:${contact.secondaryContact}`
                          : `tel:${contact.secondaryContact.replace(/[^\d+]/g, '')}`}
                        className="flex items-center gap-3 rounded-xl border border-line-subtle p-4 transition hover:border-amber-300 hover:bg-amber-50/50"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-800"><Icon name={contact.secondaryIsEmail ? 'mail' : 'phone'} size={20} /></span>
                        <span className="min-w-0">
                          <span className="block text-label-sm text-content-tertiary">{contact.name} · {t(contact.secondaryIsEmail ? 'faq.companyEmail' : 'faq.supportHotline')}</span>
                          <span className="mt-1 block truncate text-label text-content-primary" dir="ltr">{contact.secondaryContact}</span>
                        </span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <section aria-labelledby="faq-questions-heading" className="mx-auto mt-14 max-w-4xl">
          <h2 id="faq-questions-heading" className="text-h2 text-content-primary">{t('faq.questionsTitle')}</h2>
          <div className="mt-5 grid gap-3">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group rounded-xl border border-line-subtle bg-bg-surface p-5 shadow-sm transition-colors open:border-amber-300 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-label font-semibold text-content-primary marker:hidden">
                  {question}
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-800 transition-transform group-open:rotate-45">
                    <Icon name="plus" size={17} />
                  </span>
                </summary>
                <p className="readable-copy mt-4 max-w-3xl border-t border-line-subtle pt-4 text-body-sm text-content-secondary">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <aside className="mx-auto mt-12 flex max-w-4xl flex-col items-start justify-between gap-5 rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 shadow-lg shadow-amber-950/5 sm:flex-row sm:items-center sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-h3 text-content-primary">{t('faq.assistantTitle')}</h2>
            <p className="readable-copy mt-2 text-body-sm text-content-secondary">{t('faq.assistantBody')}</p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('utu-assistant:open'))}
            className="inline-flex min-h-12 shrink-0 items-center gap-2.5 rounded-full border border-amber-300/40 bg-amber-500 px-5 py-3 font-bold text-slate-950 shadow-xl shadow-amber-500/20 transition-all duration-300 hover:scale-[1.03] hover:bg-amber-400"
          >
            <Icon name="zap" size={18} />
            {t('faq.assistantCta')}
          </button>
        </aside>
      </div>
    </section>
  );
}
