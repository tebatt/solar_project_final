import { useEffect, useState, type FormEvent } from 'react';
import { api, type ChatMessage } from '../../api/client';
import { useLanguage } from '../../i18n/LanguageProvider';

type RequestChatProps = {
  groupId: string;
  companyId: number;
  companyName: string;
  requestSummary: string;
  quoteTotal?: number;
  contactUnlocked?: boolean;
  customerPhone?: string | null;
  companyPhone?: string | null;
  companySupportPhone?: string | null;
  accessToken?: string;
  companyToken?: string;
};

const CHAT_POLL_INTERVAL_MS = 4000;
const FILTERED_MESSAGE = '[تم حجب معلومات التواصل المباشر لحماية الاتفاقية]';

export function RequestChat({
  groupId,
  companyId,
  companyName,
  requestSummary,
  quoteTotal,
  contactUnlocked = false,
  customerPhone,
  companyPhone,
  companySupportPhone,
  accessToken,
  companyToken,
}: RequestChatProps) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [expanded, setExpanded] = useState(() => {
    const query = window.location.hash.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    return params.get('chat') === '1'
      && params.get('requestId') === groupId
      && params.get('companyId') === String(companyId);
  });

  useEffect(() => {
    const openLinkedConversation = () => {
      const query = window.location.hash.split('?')[1] ?? '';
      const params = new URLSearchParams(query);
      if (
        params.get('chat') === '1'
        && params.get('requestId') === groupId
        && params.get('companyId') === String(companyId)
      ) {
        setExpanded(true);
      }
    };
    window.addEventListener('hashchange', openLinkedConversation);
    return () => window.removeEventListener('hashchange', openLinkedConversation);
  }, [companyId, groupId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const labels = ar
    ? {
      open: 'فتح المحادثة',
      close: 'إغلاق المحادثة',
      title: 'محادثة الطلب',
      customer: 'العميل',
      company: 'الشركة',
      placeholder: 'اكتب رسالتك...',
      send: 'إرسال',
      loading: 'جارٍ تحميل المحادثة...',
      noMessages: 'ابدأ المحادثة برسالة آمنة داخل المنصة.',
      blocked: 'تم حجب معلومات التواصل المباشر لحماية الاتفاقية. يرجى متابعة التفاوض هنا حتى قبول العرض ودفع العربون.',
      request: 'الطلب',
      quote: 'قيمة العرض',
      contactBanner: 'لحماية حقوق الزبون والشركة، يتم فتح مشاركة أرقام الهواتف والموقع الدقيق تلقائياً عند توقيع العقد وتأكيد العربون عبر منصة Utu.',
      contactsUnlocked: 'تم فتح معلومات التواصل المباشر بعد تأكيد العربون.',
      customerPhone: 'هاتف العميل',
      companyPhone: 'هاتف الشركة',
      companySupportPhone: 'رقم دعم الشركة',
      genericError: 'تعذر تحميل المحادثة أو إرسال الرسالة.',
    }
    : {
      open: 'Open conversation',
      close: 'Close conversation',
      title: 'Request conversation',
      customer: 'Client',
      company: 'Company',
      placeholder: 'Write a message...',
      send: 'Send',
      loading: 'Loading conversation...',
      noMessages: 'Start the conversation with a safe in-platform message.',
      blocked: 'Direct contact information was blocked to protect the agreement. Please continue negotiating here until the quote is accepted and the deposit is paid.',
      request: 'Request',
      quote: 'Quote total',
      contactBanner: 'To protect both customer and company rights, phone numbers and exact location sharing are unlocked automatically upon signing the contract and confirming the deposit via Utu.',
      contactsUnlocked: 'Direct contact information unlocked after deposit confirmation.',
      customerPhone: 'Customer phone',
      companyPhone: 'Company phone',
      companySupportPhone: 'Company support line',
      genericError: 'Could not load the conversation or send the message.',
    };

  useEffect(() => {
    if (!expanded) return undefined;
    let active = true;
    const loadMessages = async () => {
      try {
        const result = await api.chatMessages(groupId, companyId, accessToken, companyToken);
        if (active) {
          setMessages(result);
          setError('');
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : labels.genericError);
      }
    };
    void loadMessages();
    // Only while this conversation is open, and not while the tab is hidden.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void loadMessages();
    }, CHAT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accessToken, companyId, companyToken, expanded, groupId, labels.genericError]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setError('');
    setWarning('');
    try {
      const sent = await api.sendChatMessage(
        groupId,
        companyId,
        content,
        accessToken,
        companyToken,
      );
      setMessages((current) => current.some((message) => message.id === sent.id)
        ? current
        : [...current, sent].sort((left, right) => left.id - right.id));
      setDraft('');
      if (sent.violation_type) setWarning(labels.blocked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-line-subtle bg-bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-label text-content-primary"
      >
        <span>{expanded ? labels.close : labels.open}</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-t border-line-subtle p-4">
          <header className="rounded-lg bg-bg-subtle px-4 py-3">
            <h4 className="text-label text-content-primary">{labels.title} · {companyName}</h4>
            <p className="mt-1 text-label-sm text-content-secondary">
              {labels.request}: {groupId} · {requestSummary}
              {quoteTotal !== undefined && ` · ${labels.quote}: ${quoteTotal.toLocaleString('en-US')} IQD`}
            </p>
          </header>
          {!contactUnlocked ? (
            <aside
              role="note"
              className="mt-3 rounded-lg border border-line-brand bg-[var(--brand-subtle)] px-4 py-3 text-body-sm text-content-secondary"
            >
              {labels.contactBanner}
            </aside>
          ) : (
            <aside
              role="status"
              className="mt-3 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-content-primary"
            >
              <p className="font-medium">{labels.contactsUnlocked}</p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                {customerPhone && (
                  <span>{labels.customerPhone}: <a className="underline" href={`tel:${customerPhone.replace(/[^\d+]/g, '')}`}><bdi dir="ltr">{customerPhone}</bdi></a></span>
                )}
                {companyPhone && (
                  <span>{labels.companyPhone}: <a className="underline" href={`tel:${companyPhone.replace(/[^\d+]/g, '')}`}><bdi dir="ltr">{companyPhone}</bdi></a></span>
                )}
                {companySupportPhone && companySupportPhone !== companyPhone && (
                  <span>{labels.companySupportPhone}: <a className="underline" href={`tel:${companySupportPhone.replace(/[^\d+]/g, '')}`}><bdi dir="ltr">{companySupportPhone}</bdi></a></span>
                )}
              </div>
            </aside>
          )}
          <div
            role="log"
            aria-label={labels.title}
            aria-live="polite"
            className="mt-3 flex max-h-80 min-h-24 flex-col gap-3 overflow-y-auto rounded-lg border border-line-subtle p-3"
          >
            {messages.length === 0 ? (
              <p className="m-auto text-center text-body-sm text-content-tertiary">{labels.noMessages}</p>
            ) : messages.map((message) => (
              <article key={message.id} className="max-w-[90%] rounded-lg bg-bg-subtle px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-label-sm font-semibold text-content-primary">
                    {message.sender_role === 'client' ? labels.customer : labels.company}: {message.sender_name}
                  </span>
                  <time className="text-body-xs text-content-tertiary" dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleString(ar ? 'ar-IQ' : 'en-US')}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-content-secondary">
                  {message.violation_type ? FILTERED_MESSAGE : message.content}
                </p>
              </article>
            ))}
          </div>
          {warning && (
            <p role="alert" className="mt-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-3 py-2 text-body-sm text-content-secondary">
              {warning}
            </p>
          )}
          {error && <p role="alert" className="mt-3 text-body-sm text-[var(--status-danger)]">{error}</p>}
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor={`chat-${groupId}-${companyId}`}>{labels.placeholder}</label>
            <input
              id={`chat-${groupId}-${companyId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              placeholder={labels.placeholder}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-bg-page px-3 py-2 text-body-sm text-content-primary"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-11 rounded-md bg-bg-brand px-5 py-2 text-label text-content-on-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? labels.loading : labels.send}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
