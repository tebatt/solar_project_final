import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { Projects } from '../sections/Projects';

export function ProjectsPage() {
  return (
    <>
      <Header />
      <main id="main">
        <Projects galleryPage />
      </main>
      <Footer />
    </>
  );
}
