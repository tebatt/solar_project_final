import { Icon } from '../components/icons/Icon';
import { SolarCalculator } from '../components/calculator/SolarCalculator';
import { Reveal } from '../motion/Reveal';
import { useLanguage } from '../i18n/LanguageProvider';
import type { TranslationKey } from '../i18n/translations';

const POINTS: TranslationKey[] = ['calc.p1', 'calc.p2', 'calc.p3'];

export function CalculatorSection() {
  const { t } = useLanguage();

  return (
    <section
      id="calculator"
      aria-labelledby="calculator-heading"
      className="on-dark relative overflow-hidden bg-bg-panel-deep"
    >
      <span id="services" className="absolute inset-x-0 top-0 scroll-mt-24" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-[-30%] h-[940px] w-[1240px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(229,146,15,0.20) 0%, rgba(212,86,51,0.08) 55%, transparent 100%)',
        }}
      />

      <div className="container-page section-y relative grid w-full grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-14">
        <Reveal className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow inline-flex w-fit items-center gap-2 rounded-full bg-[var(--brand-subtle)] px-3.5 py-1.5 text-content-brand">
            <Icon name="zap" size={14} className="shrink-0" />
            {t('calc.pill')}
          </p>
          <h2 id="calculator-heading" className="text-h1 text-content-on-dark">
            {t('calc.h2a')}
            <br />
            {t('calc.h2b')}
          </h2>
          <p className="readable-copy text-body-lg text-content-on-dark-muted">{t('calc.sub')}</p>
          <ul className="mt-1 flex flex-col gap-3.5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-panel-raised text-sage-300 shadow-[0_0_16px_rgba(134,239,172,0.12)]">
                  <Icon name="check" size={14} />
                </span>
                <span className="text-body leading-relaxed text-content-on-dark">{t(p)}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="contents">
          <SolarCalculator dashboardLayout choiceBanner={t('calc.choiceBanner')} />
        </Reveal>
      </div>
    </section>
  );
}
