import { Icon } from '../components/icons/Icon';
import { SolarCalculator } from '../components/calculator/SolarCalculator';
import { Reveal } from '../motion/Reveal';
import { useLanguage } from '../i18n/LanguageProvider';
import type { TranslationKey } from '../i18n/translations';
import { CALC_SKY_THEME } from '../theme/experiments';
import '../styles/calculator-sky.css';

const POINTS: TranslationKey[] = ['calc.p1', 'calc.p2', 'calc.p3'];

export function CalculatorSection() {
  const { t } = useLanguage();

  return (
    <section
      id="calculator"
      aria-labelledby="calculator-heading"
      className={
        CALC_SKY_THEME
          ? 'relative overflow-hidden'
          : 'on-dark relative overflow-hidden bg-bg-panel-deep'
      }
      data-calc-theme={CALC_SKY_THEME ? 'sky' : undefined}
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

      <div className="container-page relative grid w-full grid-cols-1 items-start gap-7 py-12 md:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-6 lg:py-16">
        <Reveal className="flex flex-col gap-3.5 lg:col-start-1 lg:row-start-1">
          <p className="eyebrow inline-flex w-fit items-center gap-2 rounded-full bg-[var(--brand-subtle)] px-3.5 py-1.5 text-content-brand">
            <Icon name="zap" size={14} className="shrink-0" />
            {t('calc.pill')}
          </p>
          <h2 id="calculator-heading" className="text-h2 text-content-on-dark">
            {t('calc.h2a')}
            <br />
            {t('calc.h2b')}
          </h2>
          <p className="readable-copy text-body text-content-on-dark-muted">{t('calc.sub')}</p>
          <ul className="mt-1 flex flex-col gap-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-panel-raised text-sage-300">
                  <Icon name="check" size={13} />
                </span>
                <span className="text-body-sm text-content-on-dark">{t(p)}</span>
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
