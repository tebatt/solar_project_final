import { useState } from 'react';
import { Button } from '../ui/Button';
import { VoiceGuideButton } from '../ui/VoiceGuideButton';
import { Icon } from '../icons/Icon';
import { ApplianceRow } from './ApplianceRow';
import { ResultStat } from './ResultStat';
import { ASSUMPTIONS, useSolarEstimate } from './useSolarEstimate';
import { defaultAppliances, extraAppliances, type Appliance } from '../../data/content';
import { fmt, useLanguage } from '../../i18n/LanguageProvider';
import { useQuoteRequest } from '../../state/QuoteRequestProvider';
import { useAssessment } from '../../state/AssessmentProvider';
import { estimateToQuoteSystem } from '../../assessment/utuAssessment';
import { paths } from '../../routes/useHashRoute';

/**
 * The smart energy calculator panel.
 *
 * Starts with the standard household appliances visible but inactive. Users
 * can activate a load with its unit stepper or load the example configuration.
 */
export function SolarCalculator({
  dashboardLayout = false,
  choiceBanner,
}: {
  dashboardLayout?: boolean;
  choiceBanner?: string;
}) {
  const { t } = useLanguage();
  const { startFromSystem } = useQuoteRequest();
  const { start: startAssessment } = useAssessment();
  const [appliances, setAppliances] = useState<Appliance[]>(() =>
    defaultAppliances.map((appliance) => ({ ...appliance, units: 0, hours: 0 })),
  );
  const [activeId, setActiveId] = useState(defaultAppliances[0]?.id ?? '');

  const estimate = useSolarEstimate(appliances);
  const isEmpty = estimate.dailyWh === 0;

  const availableAppliances = [...defaultAppliances, ...extraAppliances];
  const remaining = availableAppliances.filter((e) => !appliances.some((a) => a.id === e.id));

  const update = (next: Appliance) => {
    const configured = availableAppliances.find((appliance) => appliance.id === next.id);
    setAppliances((list) => list.map((appliance) => {
      if (appliance.id !== next.id) return appliance;
      if (next.units === 0) return { ...next, hours: 0 };
      if (appliance.units === 0 && next.units > 0) {
        return { ...next, hours: configured?.hours ?? 1 };
      }
      return next;
    }));
  };

  const addAppliance = () => {
    const next = remaining[0];
    if (next) {
      setAppliances((list) => [...list, { ...next, units: 0, hours: 0 }]);
      setActiveId(next.id);
    }
  };

  const loadDemoValues = () => {
    const demo = defaultAppliances.map((appliance) => ({ ...appliance }));
    setAppliances(demo);
    setActiveId(demo[0]?.id ?? '');
  };

  const resetAppliances = () => {
    setAppliances(defaultAppliances.map((appliance) => ({ ...appliance, units: 0, hours: 0 })));
    setActiveId(defaultAppliances[0]?.id ?? '');
  };

  const removeAppliance = (id: string) => {
    setAppliances((list) => list.filter((appliance) => appliance.id !== id));
    if (activeId === id) {
      setActiveId(appliances.find((appliance) => appliance.id !== id)?.id ?? '');
    }
  };

  const goTo = (hash: string) => {
    window.location.hash = hash;
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  /** Send this result to the quote request so nothing is retyped (still editable there). */
  const requestQuotes = () => {
    startFromSystem(estimateToQuoteSystem(estimate));
    goTo(paths.request);
  };

  /** Open the UTU assessment with exactly these appliances. */
  const openAssessment = () => {
    startAssessment(appliances);
    goTo(paths.assessment);
  };

  const liveGroups = appliances.filter((a) => a.units > 0 && a.hours > 0).length;

  return (
    <div className={dashboardLayout ? 'contents' : 'on-dark rounded-xl border border-line-on-dark bg-bg-inverse p-3 shadow-panel sm:p-4'}>
      <div className={dashboardLayout ? 'on-dark rounded-xl border border-line-on-dark bg-bg-inverse p-3 shadow-panel sm:p-4' : ''}>
        {choiceBanner && (
          <p className="mb-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-body-sm text-amber-100">
            {choiceBanner}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[11rem] flex-1">
            <h3 className="text-h4 text-content-on-dark">{t('panel.title')}</h3>
            <div className="mt-0.5 flex items-center gap-1">
              <p className="text-label-sm text-content-on-dark-muted">{t('panel.sub')}</p>
              <VoiceGuideButton text="اختر الأجهزة التي تستخدمها، ثم حدد عدد كل جهاز وساعات تشغيله يومياً." onDark />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadDemoValues}
              className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-label-sm font-semibold text-amber-200 transition-colors hover:border-amber-200/70 hover:bg-amber-400/20"
            >
              {t('panel.tag')}
            </button>
            <button
              type="button"
              onClick={resetAppliances}
              className="rounded-full border border-line-on-dark bg-transparent px-3 py-1.5 text-label-sm font-semibold text-content-on-dark-muted transition-colors hover:border-panel-400 hover:bg-bg-panel-raised hover:text-content-on-dark"
            >
              {t('panel.reset')}
            </button>
          </div>
        </div>

        <ul className="mt-3 flex flex-col gap-1.5">
          {appliances.map((a) => (
            <ApplianceRow
              key={a.id}
              appliance={a}
              active={a.id === activeId}
              onChange={update}
              onFocus={() => setActiveId(a.id)}
              onRemove={() => removeAppliance(a.id)}
            />
          ))}
        </ul>

        {remaining.length > 0 && (
          <button
            type="button"
            onClick={addAppliance}
            className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-line-on-dark py-2.5 text-label text-solar-300 transition-colors hover:border-solar-400 hover:bg-bg-panel-deep"
          >
            <Icon name="plus" size={17} />
            {t('panel.add')}
          </button>
        )}
      </div>

      <div className={dashboardLayout
        ? 'on-dark rounded-2xl border border-amber-500/20 bg-slate-900/60 p-5 backdrop-blur-md lg:col-span-2'
        : ''}>
        <hr className={dashboardLayout ? 'mb-4 border-line-on-dark lg:hidden' : 'my-4 border-line-on-dark'} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="eyebrow text-content-on-dark-muted">{t('panel.resultHead')}</h4>
          <p className="text-label-sm text-content-on-dark-muted">
            {t('panel.basis', { h: ASSUMPTIONS.PEAK_SUN_HOURS })}
          </p>
        </div>

        {isEmpty ? (
          <div
            role="status"
            className="mt-3 rounded-lg border border-dashed border-line-on-dark bg-bg-panel-deep px-5 py-6 text-center"
          >
            <Icon
              name="calculator"
              size={28}
              className="mx-auto text-content-on-dark-muted"
              aria-hidden="true"
            />
            <p className="mt-3 text-label text-content-on-dark">{t('empty.title')}</p>
            <p className="mx-auto mt-1 max-w-md text-body-sm text-content-on-dark-muted">
              {t('empty.body')}
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ResultStat
              icon="zap"
              label={t('res.amps')}
              value={fmt.dec(estimate.peakLoadAmps)}
              unit="A"
              note={t('res.ampsNote')}
            />
            <ResultStat
              icon="battery"
              label={t('res.usage')}
              value={fmt.dec(estimate.dailyKWh)}
              unit={t('res.unitKwhDay')}
              note={t('res.usageNote', { n: liveGroups })}
            />
            <ResultStat
              icon="solar-panel"
              label={t('res.size')}
              value={fmt.dec(estimate.systemKWp)}
              unit={t('res.unitKwp')}
              note={t('res.sizeNote', { n: estimate.panelCount, w: ASSUMPTIONS.PANEL_WATTS })}
              emphasis
            />
            <ResultStat
              icon="battery"
              label={t('res.battery')}
              value={fmt.dec(estimate.batteryKWh)}
              unit={t('res.unitKwh')}
              note={t('res.batteryNote', { n: Math.round(estimate.outageHours) })}
            />
            <ResultStat
              icon="sun"
              label={t('res.panels')}
              value={fmt.int(estimate.panelCount)}
              unit={t('res.unitPanels')}
              note={t('res.panelsNote', { w: ASSUMPTIONS.PANEL_WATTS })}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            className="transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-lg"
            onClick={requestQuotes}
            disabled={isEmpty}
          >
            {t('panel.btn')}
          </Button>
          {isEmpty && (
            <button
              type="button"
              onClick={() => goTo(paths.request)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/10 px-4 py-2.5 text-label font-semibold text-amber-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200/70 hover:bg-amber-400/20"
            >
              {t('panel.directRequest')}
              <Icon name="arrow-right" size={16} className="rtl:rotate-180" />
            </button>
          )}
          <Button
            variant="onDark"
            className="transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-amber-200/50 hover:shadow-lg"
            onClick={openAssessment}
            disabled={isEmpty}
          >
            {t('panel.assessCta')}
          </Button>
          <p className="min-w-[12rem] flex-1 text-label-sm text-content-on-dark-muted">
            {t('panel.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
