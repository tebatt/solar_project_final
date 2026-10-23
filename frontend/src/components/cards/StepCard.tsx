import { Icon } from '../icons/Icon';
import { useLanguage } from '../../i18n/LanguageProvider';
import type { Step } from '../../data/content';

/** One step of How It Works. The ordinal is decorative — order comes from the list. */
export function StepCard({ step }: { step: Step }) {
  const { pick } = useLanguage();

  return (
    <div className="flex h-full min-h-[17rem] flex-col justify-between gap-6 rounded-xl border border-slate-200 bg-bg-surface p-6 transition-all duration-300 hover:-translate-y-2 hover:border-indigo-900/30 hover:shadow-xl hover:shadow-indigo-900/10">
      <div>
        <div className="flex items-center gap-3.5">
          <span aria-hidden="true" className="numeric text-data-l text-line">
            {step.number}
          </span>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-indigo-900/20 bg-indigo-950/10 p-2.5 text-indigo-900">
            <Icon name={step.icon} size={24} />
          </span>
        </div>
        <h3 className="mt-5 text-h4 font-bold text-slate-900">{pick(step.title)}</h3>
      </div>
      <p className="text-left text-balance text-sm leading-relaxed text-slate-700">{pick(step.description)}</p>
    </div>
  );
}
