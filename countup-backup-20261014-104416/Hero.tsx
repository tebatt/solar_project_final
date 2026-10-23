import { motion, useReducedMotion as useMotionReduced, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { BlurText, BLUR_TEXT_DURATION } from '../components/ui/BlurText';
import MicroSlats from '../components/backgrounds/MicroSlats';
import { Icon, type IconName } from '../components/icons/Icon';
import { fadeInUp, staggerContainer, toReducedMotion } from '../motion/animation';
import { useReducedMotion } from '../motion/useReducedMotion';
import { fmt, useLanguage } from '../i18n/LanguageProvider';
import type { TranslationKey } from '../i18n/translations';
import { useCompanies } from '../api/useCompanies';
import { useShownReviewStats, type ShownReviewStats } from '../api/shownReviews';
import type { Company } from '../data/content';

type TrustStat = {
  value: number | null;
  precision?: number;
  suffix?: string;
  label: TranslationKey;
  icon: IconName;
};

/**
 * Live platform figures, computed from the companies API — never typed-in
 * marketing numbers. Shows a dash while loading or when the API is down.
 */
function trustStats(companies: Company[], ready: boolean, shownReviews: ShownReviewStats | null): TrustStat[] {
  const verified = companies.filter((c) => c.status === 'verified');
  const verifiedReviewCount = verified.reduce((sum, c) => sum + c.reviews, 0);
  const weighted = verified.reduce((sum, c) => sum + c.rating * c.reviews, 0);
  // With the demo-review preview on, the figures match the reviews section
  // (demo + verified); otherwise they count verified reviews only.
  const reviewCount = shownReviews ? shownReviews.count : verifiedReviewCount;
  const averageRating = shownReviews
    ? shownReviews.average
    : verifiedReviewCount > 0 ? weighted / verifiedReviewCount : null;
  return [
    { value: ready ? verified.length : null, label: 'hero.trust1', icon: 'shield-check' },
    { value: ready ? reviewCount : null, label: 'hero.trust2', icon: 'solar-panel' },
    {
      value: ready ? averageRating : null,
      precision: 1,
      suffix: ' / 5',
      label: 'hero.trust3',
      icon: 'users',
    },
  ];
}

function AnimatedTrustStat({
  stat,
  label,
  prefersReduced,
}: {
  stat: TrustStat;
  label: string;
  prefersReduced: boolean;
}) {
  const [count, setCount] = useState(0);
  const target = stat.value;

  useEffect(() => {
    if (target === null) {
      setCount(0);
      return;
    }
    if (prefersReduced) {
      setCount(target);
      return;
    }

    let frame = 0;
    let startTime: number | null = null;
    const duration = 1000;
    const animate = (now: number) => {
      startTime ??= now;
      const progress = Math.min((now - startTime) / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      setCount(target * easedProgress);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [prefersReduced, target]);

  const displayValue = target === null
    ? '—'
    : stat.precision
      ? fmt.dec(count, stat.precision)
      : fmt.int(count);

  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/30 hover:shadow-[0_12px_30px_-12px_rgba(245,158,11,0.35)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-bg-panel-raised text-solar-300">
        <Icon name={stat.icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="numeric block text-label text-content-on-dark">
          {displayValue}{target !== null ? stat.suffix : ''}
        </span>
        <span className="block text-label-sm text-content-on-dark-muted">{label}</span>
      </span>
    </li>
  );
}

/** Words per reveal group in the heading: "اختر منظومة الطاقة / الشمسية المثالية / لاحتياجاتك". */
const HEADING_GROUPS = { ar: [3, 2, 1], en: [3, 2, 4] } as const satisfies Record<string, readonly number[]>;

/** Twelve-hour output curve; the three amber bars mark solar noon. */
const SPARK = [14, 22, 34, 48, 62, 74, 80, 72, 58, 40, 26, 16];

export function Hero() {
  const prefersReduced = useReducedMotion();
  const reduceOnFirstRender = useMotionReduced();
  const { t, lang } = useLanguage();
  const { companies, source } = useCompanies();
  const shownReviews = useShownReviewStats();
  const trust = trustStats(companies, source === 'api', shownReviews);
  const container = prefersReduced ? toReducedMotion(staggerContainer) : staggerContainer;
  const item = prefersReduced ? toReducedMotion(fadeInUp) : fadeInUp;

  // The sun's halo warms a little as the hero scrolls away. Framer shares one
  // passive scroll listener across the page, so this adds no handler of its own.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const haloOpacity = useTransform(scrollYProgress, [0, 0.6], [0.55, 0.9]);
  const haloScale = useTransform(scrollYProgress, [0, 0.6], [1, 1.12]);

  return (
    <section ref={heroRef} id="top" className="on-dark relative overflow-hidden bg-bg-inverse">
      {/* Sunset glow, upper right — the light source for the whole page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-20%] top-[-60%] h-[1100px] w-[1500px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(242,172,46,0.34) 0%, rgba(212,86,51,0.18) 42%, transparent 100%)',
        }}
      />
      {/* Cool dusk counterweight, lower left. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-30%] top-[30%] h-[820px] w-[1100px]"
        style={{ background: 'radial-gradient(closest-side, rgba(77,92,134,0.30) 0%, transparent 100%)' }}
      />

      <div className="container-page relative grid w-full grid-cols-1 items-center gap-12 py-16 md:py-20 lg:grid-cols-2 lg:gap-12 lg:py-24">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_-42px_rgba(242,172,46,0.45)] backdrop-blur-md sm:p-7"
        >
          <motion.p
            variants={item}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-line-on-dark bg-bg-panel-raised py-1.5 ps-2 pe-3.5 text-label text-content-on-dark-muted"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-[var(--brand-subtle)] text-content-brand">
              <Icon name="zap" size={13} />
            </span>
            {t('hero.pill')}
          </motion.p>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-content-on-dark lg:text-5xl">
            <BlurText text={t('hero.h1')} groupSizes={HEADING_GROUPS[lang]} />
          </h1>

          <motion.p variants={item} className="readable-copy max-w-[54ch] text-start text-balance text-body-lg leading-relaxed text-slate-300">
            {t('hero.sub')}
          </motion.p>

          {/* The buttons arrive once the heading has finished revealing. */}
          <motion.div
            initial={reduceOnFirstRender ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: BLUR_TEXT_DURATION, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-wrap items-center gap-3.5"
          >
            <Button
              trailingArrow
              className="transform rounded-lg bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-300 text-slate-950 shadow-[0_12px_30px_-12px_rgba(245,158,11,0.7)] transition-all duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] hover:from-amber-300 hover:to-yellow-200 hover:shadow-[0_16px_36px_-12px_rgba(245,158,11,0.8)] motion-safe:active:translate-y-0"
              onClick={() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('hero.cta1')}
            </Button>
            <Button
              variant="onDark"
              className="transform rounded-lg border-white/15 bg-gradient-to-r from-white/10 to-white/[0.03] text-white shadow-lg backdrop-blur-sm transition-all duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] hover:border-amber-200/60 hover:from-white/15 hover:to-white/[0.06] hover:shadow-amber-500/20 motion-safe:active:translate-y-0"
              onClick={() => document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('hero.cta2')}
            </Button>
          </motion.div>

          <motion.ul variants={item} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {trust.map((stat) => (
              <AnimatedTrustStat
                key={stat.label}
                stat={stat}
                label={t(stat.label)}
                prefersReduced={prefersReduced}
              />
            ))}
          </motion.ul>
        </motion.div>

        {/* Hero visual: sunset sky over a photovoltaic array, with live data.
            The illustration is composed LTR and stays that way; the two data
            cards on top follow the page direction. */}
        <motion.div
          dir="ltr"
          role="img"
          aria-label={t('a11y.heroVisual')}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReduced ? 0.01 : 0.6,
            ease: [0.43, 0.13, 0.23, 0.96],
            delay: 0.15,
          }}
          className="relative aspect-[596/460] w-full overflow-hidden rounded-2xl border border-line-on-dark"
          style={{ backgroundImage: 'linear-gradient(150deg, #3c5e6e 0%, #16242d 45%, #0a0f13 100%)' }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[44%]"
            style={{
              background:
                'linear-gradient(180deg, rgba(239,154,124,0.62) 0%, rgba(212,86,51,0.32) 45%, transparent 100%)',
            }}
          />
          {/* Sun: halo, breathing glow and disc float together as one group. */}
          <div
            aria-hidden="true"
            className="hero-float absolute h-[22.6%] w-[17.4%]"
            style={{ left: '64.8%', top: '9.6%' }}
          >
            <motion.div
              className="absolute -inset-[60%] rounded-full"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(255,214,120,0.6) 0%, rgba(242,172,46,0.24) 45%, transparent 100%)',
                opacity: prefersReduced ? 0.55 : haloOpacity,
                scale: prefersReduced ? 1 : haloScale,
              }}
            />
            {/* A filled gradient, not a box-shadow: a shadow has an unpainted
                centre that showed as a dark ring once the layer scaled up. */}
            <div
              className="hero-sun-glow absolute -inset-[38%] rounded-full"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(255,214,130,0.55) 55%, rgba(255,196,90,0.22) 78%, transparent 100%)',
              }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                backgroundImage: 'linear-gradient(180deg, #fff8ea 0%, #f7c55f 55%, #e5754f 100%)',
                boxShadow: '0 0 64px 8px rgba(242,172,46,0.5)',
              }}
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 top-[45.6%] overflow-hidden"
            style={{ backgroundImage: 'linear-gradient(160deg, #294451 0%, #111a21 50%, #0a0f13 100%)' }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to bottom, rgba(187,196,220,0.16) 0 1.2px, transparent 1.2px 26px),' +
                  'repeating-linear-gradient(to right, rgba(187,196,220,0.2) 0 1.2px, transparent 1.2px 56px)',
              }}
            />
            <div
              className="absolute inset-y-0 right-0 w-1/2"
              style={{
                background:
                  'linear-gradient(150deg, rgba(247,197,95,0.42) 0%, rgba(212,86,51,0.12) 60%, transparent 100%)',
              }}
            />
            {/* React Bits Micro Slats, confined to the panel field's own clip and
                screened over the cells so the grid stays visible underneath. */}
            <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen">
              <MicroSlats
                preset="tide"
                color="#c98a2e"
                glintColor="#fff3d6"
                backgroundColor="transparent"
                slatWidth={4}
                slatHeight={10}
                gap={2}
                perspective={0}
                fog={0}
                intro={false}
              />
            </div>
          </div>

          {/* live output card */}
          <div
            dir="inherit"
            className="hero-float hero-float--card absolute left-[4%] top-[6.5%] rounded-lg border border-panel-400 p-4 shadow-panel backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(10,15,19,0.85)' }}
          >
            <p className="flex items-center gap-2 text-label-sm text-content-on-dark-muted">
              <Icon name="trending-up" size={15} className="shrink-0 text-solar-300" />
              {t('hero.live')}
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="numeric text-data-l text-content-on-dark">6.2</span>
              <span className="text-label text-content-on-dark-muted">kW</span>
            </p>
            <div className="mt-3 flex h-20 items-end gap-1" aria-hidden="true">
              {SPARK.map((h, i) => (
                <span
                  key={i}
                  className={i >= 5 && i <= 7 ? 'rounded-sm bg-solar-400' : 'rounded-sm bg-dusk-500'}
                  style={{ width: 7, height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* recommendation chip */}
          <div
            dir="inherit"
            className="hero-float hero-float--chip absolute bottom-[8%] right-[4%] flex items-center gap-2.5 rounded-[12px] px-4 py-3 shadow-lg"
            style={{ backgroundColor: 'rgba(253,250,246,0.95)' }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--brand-subtle)] text-content-brand">
              <Icon name="solar-panel" size={18} />
            </span>
            <span>
              <span className="block text-label text-content-primary">{t('hero.rec')}</span>
              <span className="block text-label-sm text-content-tertiary">{t('hero.recSub')}</span>
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
