import { useMemo, useState } from 'react';
import type { ContractDocument } from '../../api/client';
import { useLanguage } from '../../i18n/LanguageProvider';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatPrice(price: number): string {
  return `${price.toLocaleString('en-US')} دينار عراقي`;
}

export function ContractDocumentCard({ contract }: { contract: ContractDocument }) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const today = useMemo(() => formatDate(new Date()), []);
  const labels = {
    view: lang === 'ar' ? 'عرض وثيقة العقد' : 'View contract document',
    title: 'وثيقة عقد اتفاق وتجهيز منظومة شمسية',
    headerRight: 'جمهورية العراق / منصة أوتو (UTU) للطاقة الشمسية',
    reference: 'العدد',
    date: 'التاريخ',
    company: 'طرف أول (الشركة)',
    customer: 'طرف ثاني (الزبون)',
    subject: 'الموضوع',
    system: 'اتفاق تنفيذ وتجهيز منظومة طاقة شمسية بقدرة',
    in: 'في محافظة',
    details: 'تفاصيل المنظومة والاتفاق',
    panels: 'الألواح الشمسية',
    inverter: 'الإنفرتر',
    batteries: 'البطاريات',
    capacity: 'قدرة المنظومة',
    price: 'السعر الإجمالي المتفق عليه',
    warranty: 'فترة الضمان',
    terms: 'شروط التنفيذ',
    installDays: 'مدة التركيب',
    days: 'أيام',
    digitalAgreement: 'تم إبرام هذا العقد إلكترونياً بين الطرفين وفق تفاصيل العرض المقبول.',
    firstSignature: 'توقيع الطرف الأول',
    secondSignature: 'توقيع الطرف الثاني',
    stamp: 'منصة أوتو - عقد معتمد وموثق رقمياً',
    download: 'تحميل الوثيقة',
    close: 'إغلاق',
    notSpecified: 'غير محدد',
  };
  const specifications = contract.specifications;
  const terms = contract.installation_terms;
  const district = specifications.district ? ` / ${specifications.district}` : '';
  const location = `${specifications.governorate}${district}`;
  const systemDescription = `${specifications.system_kwp.toLocaleString('en-US')} kWp ${labels.in} ${location}`;
  const price = formatPrice(contract.price_iqd);
  const warranty = terms.warranty || labels.notSpecified;
  const installDays = terms.install_days == null ? labels.notSpecified : `${terms.install_days} ${labels.days}`;
  const panelDetails = `${specifications.panel_count.toLocaleString('en-US')} لوح - ${terms.panel_brand || labels.notSpecified}`;
  const batteryDetails = `${specifications.battery_kwh.toLocaleString('en-US')} kWh - ${terms.battery_brand || labels.notSpecified}`;
  const rows = [
    [labels.panels, panelDetails],
    [labels.inverter, terms.inverter_brand || labels.notSpecified],
    [labels.batteries, batteryDetails],
    [labels.capacity, `${specifications.system_kwp.toLocaleString('en-US')} kWp`],
    [labels.price, price],
    [labels.warranty, warranty],
  ];
  const htmlRows = rows
    .map(([name, value]) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const downloadHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(labels.title)}</title>
<style>
@page{size:A4;margin:15mm}
*{box-sizing:border-box}
body{margin:0;background:#f1f2f4;color:#20242a;font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.9}
.paper{width:210mm;min-height:297mm;margin:24px auto;padding:15mm;background:#fff;border:1px solid #d5d7da;box-shadow:0 8px 28px #17212b20}
.header{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:12px;align-items:center;padding-bottom:18px;border-bottom:3px double #9b542d;text-align:center}
.header-side{font-size:12px}.header-title{font-size:18px;color:#713a22}
h1{font-size:20px;margin:0 0 6px}.reference{text-align:left;direction:rtl}
.intro{margin:22px 0}.intro p{margin:9px 0}.subject{padding:12px;border:1px solid #d9c4b7;background:#fffaf6}
h2{font-size:16px;margin:22px 0 8px;color:#713a22}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #b9b9b9;padding:8px 10px;text-align:right}th{width:38%;background:#f6f0eb}
.terms{margin:18px 0}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px;text-align:center}.signature{min-height:85px;padding-top:10px;border-top:1px solid #555}
.stamp{display:flex;width:142px;height:142px;margin:28px auto 0;padding:18px;align-items:center;justify-content:center;border:4px double #c25432;border-radius:50%;color:#a33e27;text-align:center;font-weight:bold;line-height:1.7;transform:rotate(-7deg)}
@media print{body{background:#fff}.paper{width:auto;min-height:0;margin:0;padding:0;border:0;box-shadow:none}}
</style>
</head>
<body><main class="paper">
<header class="header"><div class="header-side">${escapeHtml(labels.headerRight)}</div><div class="header-title"><h1>${escapeHtml(labels.title)}</h1></div><div class="header-side reference">${escapeHtml(labels.reference)}: ${escapeHtml(contract.contract_id)}<br>${escapeHtml(labels.date)}: ${escapeHtml(today)}</div></header>
<section class="intro">
<p><strong>${escapeHtml(labels.company)}:</strong> ${escapeHtml(contract.company_name)}</p>
<p><strong>${escapeHtml(labels.customer)}:</strong> ${escapeHtml(contract.customer_name)}</p>
<p class="subject"><strong>${escapeHtml(labels.subject)}:</strong> ${escapeHtml(labels.system)} ${escapeHtml(systemDescription)}.</p>
</section>
<h2>${escapeHtml(labels.details)}</h2><table><tbody>${htmlRows}</tbody></table>
<section class="terms"><h2>${escapeHtml(labels.terms)}</h2><p>${escapeHtml(labels.installDays)}: ${escapeHtml(installDays)}. ${escapeHtml(labels.warranty)}: ${escapeHtml(warranty)}.</p><p>${escapeHtml(labels.digitalAgreement)}</p></section>
<section class="signatures"><div class="signature">${escapeHtml(labels.firstSignature)}<br>${escapeHtml(contract.company_name)}</div><div class="signature">${escapeHtml(labels.secondSignature)}<br>${escapeHtml(contract.customer_name)}</div></section>
<div class="stamp">${escapeHtml(labels.stamp)}</div>
</main></body></html>`;
  const downloadUrl = `data:text/html;charset=utf-8,${encodeURIComponent(downloadHtml)}`;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-brand bg-[var(--brand-subtle)] p-4">
        <div>
          <p className="text-label text-content-primary">{labels.title}</p>
          <p className="mt-1 text-label-sm text-content-secondary">{contract.contract_id}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-line-brand px-3 py-2 text-label-sm font-medium text-content-brand"
        >
          {labels.view}
        </button>
      </div>
      {open && (
        <div className="contract-document-overlay fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-document-title"
            className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-slate-200 p-3 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3" dir="rtl">
              <p className="text-sm text-slate-700">الوثيقة باللغة العربية الرسمية</p>
              <div className="flex gap-2">
                <a
                  href={downloadUrl}
                  download={`${contract.contract_id}.html`}
                  className="rounded-md border border-amber-800 bg-amber-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  {labels.download}
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  طباعة
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {labels.close}
                </button>
              </div>
            </div>
            <article
            id="utu-contract-paper"
            className="mx-auto min-h-[297mm] w-full max-w-[210mm] border border-slate-300 bg-white p-6 text-right text-slate-900 shadow-md sm:p-10"
              dir="rtl"
              lang="ar"
            >
              <header className="grid grid-cols-1 items-center gap-3 border-b-4 border-double border-amber-800 pb-5 text-center sm:grid-cols-[1fr_1.5fr_1fr]">
                <p className="text-sm font-semibold leading-7">{labels.headerRight}</p>
                <h2 id="contract-document-title" className="text-xl font-bold leading-9 text-amber-950">{labels.title}</h2>
                <p className="text-sm leading-7">{labels.reference}: {contract.contract_id}<br />{labels.date}: {today}</p>
              </header>
              <section className="my-6 space-y-3 leading-8">
                <p><strong>{labels.company}:</strong> {contract.company_name}</p>
                <p><strong>{labels.customer}:</strong> {contract.customer_name}</p>
                <p className="border border-amber-200 bg-amber-50 p-3">
                  <strong>{labels.subject}:</strong> {labels.system} {systemDescription}.
                </p>
              </section>
              <h3 className="mb-2 text-lg font-bold text-amber-950">{labels.details}</h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {rows.map(([name, value]) => (
                    <tr key={name}>
                      <th scope="row" className="w-2/5 border border-slate-400 bg-amber-50 p-3 text-right font-semibold">{name}</th>
                      <td className="border border-slate-400 p-3">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <section className="my-5 leading-8">
                <h3 className="text-lg font-bold text-amber-950">{labels.terms}</h3>
                <p>{labels.installDays}: {installDays}. {labels.warranty}: {warranty}.</p>
                <p>{labels.digitalAgreement}</p>
              </section>
              <section className="mt-10 grid grid-cols-2 gap-8 text-center">
                <div className="border-t border-slate-500 pt-3">{labels.firstSignature}<br />{contract.company_name}</div>
                <div className="border-t border-slate-500 pt-3">{labels.secondSignature}<br />{contract.customer_name}</div>
              </section>
              <div className="mx-auto mt-8 flex h-36 w-36 rotate-[-7deg] items-center justify-center rounded-full border-4 border-double border-orange-700 p-4 text-center text-sm font-bold leading-7 text-orange-800">
                {labels.stamp}
              </div>
            </article>
          </section>
        </div>
      )}
    </>
  );
}
