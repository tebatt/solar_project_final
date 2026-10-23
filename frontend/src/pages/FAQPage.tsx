import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { FAQSection } from '../sections/FAQSection';

export function FAQPage() {
  return (
    <>
      <Header />
      <main id="main">
        <FAQSection />
      </main>
      <Footer />
    </>
  );
}
