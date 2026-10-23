import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { CustomerReviews } from '../sections/CustomerReviews';

export function ReviewsPage() {
  return (
    <>
      <Header />
      <main id="main">
        <CustomerReviews fullPage />
      </main>
      <Footer />
    </>
  );
}
