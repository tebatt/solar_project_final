import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { Hero } from '../sections/Hero';
import { CalculatorSection } from '../sections/CalculatorSection';
import { HowItWorks } from '../sections/HowItWorks';
import { PaymentGateways } from '../sections/PaymentGateways';
import { Companies } from '../sections/Companies';
import { Projects } from '../sections/Projects';
import { Trust } from '../sections/Trust';
import { WarrantySection } from '../sections/WarrantySection';
import { CustomerReviews } from '../sections/CustomerReviews';
import { FAQSection } from '../sections/FAQSection';
import { CALC_SKY_THEME } from '../theme/experiments';

type SectionTransitionTone =
  | 'dark-panels'
  | 'light-to-dark'
  | 'dark-to-light'
  | 'beige-continuity'
  | 'beige-to-subtle'
  | 'subtle-to-page'
  | 'page-to-beige'
  | 'beige-to-page'
  | 'dark-to-sky';

const transitionTones: Record<SectionTransitionTone, string> = {
  'dark-panels': 'from-[#0a0f13] via-[#0a0f13]/70 to-[#101a21]',
  'light-to-dark': 'from-[#faf8f5] via-[#faf8f5]/60 to-[#0f172a]',
  'dark-to-light': 'from-[#0f172a] via-[#0f172a]/80 to-[#faf8f5]',
  'beige-continuity': 'from-[#faf8f5] via-[#faf8f5]/70 to-[#faf8f5]',
  'beige-to-subtle': 'from-[#faf8f5] via-[#faf8f5]/70 to-[#f7f2ea]',
  'subtle-to-page': 'from-[#f7f2ea] via-[#f7f2ea]/70 to-[#fdfaf6]',
  'page-to-beige': 'from-[#fdfaf6] via-[#fdfaf6]/70 to-[#faf8f5]',
  'beige-to-page': 'from-[#faf8f5] via-[#faf8f5]/70 to-[#fdfaf6]',
  // Calculator sky-theme experiment; colours live in styles/calculator-sky.css.
  'dark-to-sky': 'calc-sky-transition--dark-to-sky',
};

const isSkyTone = (tone: SectionTransitionTone) => tone === 'dark-to-sky';

function SectionTransition({ tone }: { tone: SectionTransitionTone }) {
  return (
    <div
      aria-hidden="true"
      data-testid="section-transition"
      data-tone={tone}
      data-calc-theme={isSkyTone(tone) ? 'sky' : undefined}
      className={`pointer-events-none relative z-10 -my-12 h-24 bg-gradient-to-b ${transitionTones[tone]}`}
    />
  );
}

function SectionDivider() {
  return <div aria-hidden="true" data-testid="section-divider" className="h-px bg-line-subtle" />;
}

/**
 * Homepage composition.
 *
 * Section order follows the user journey the product promises:
 * discover -> calculate -> understand the process -> compare companies ->
 * see real projects -> check trust and warranty -> read reviews and FAQ.
 */
export function HomePage() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <SectionTransition tone={CALC_SKY_THEME ? 'dark-to-sky' : 'dark-panels'} />
        <CalculatorSection />
        <SectionDivider />
        <HowItWorks />
        <SectionDivider />
        <PaymentGateways />
        <SectionTransition tone="dark-to-light" />
        <Companies />
        <SectionTransition tone="beige-continuity" />
        <Projects />
        <SectionTransition tone="beige-to-subtle" />
        <Trust />
        <SectionTransition tone="subtle-to-page" />
        <WarrantySection />
        <SectionTransition tone="page-to-beige" />
        <CustomerReviews />
        <SectionTransition tone="beige-to-page" />
        <FAQSection />
      </main>
      <SectionTransition tone="light-to-dark" />
      <Footer />
    </>
  );
}
