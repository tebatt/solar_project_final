import { useEffect, useState } from 'react';
import { api, type ApiReview } from '../api/client';
import type { Review } from '../data/content';
import { ReviewCard } from '../components/cards/ReviewCard';
import { Reveal, RevealItem } from '../motion/Reveal';
import { useLanguage } from '../i18n/LanguageProvider';
import { Button } from '../components/ui/Button';

const HOMEPAGE_REVIEW_LIMIT = 9;
const DEMO_REVIEW_MARKERS = [
  'بيانات توضيحية:',
  'Seeded demo review (not customer testimony):',
  'تقييم تجريبي غير حقيقي ولا يمثل شهادة عميل:',
];
const ARABIC_COMPANY_NAMES: Record<string, string> = {
  'Rafidain Solar Systems': 'الرافدين للأنظمة الشمسية',
  'Tigris Energy Works': 'دجلة لأعمال الطاقة',
  'Al-Nahrain Renewables': 'النهرين للطاقة المتجددة',
};

const ARABIC_PROJECT_TITLES: Record<string, string> = {
  'Residential Solar System': 'منظومة شمسية سكنية',
  'Commercial Solar Installation': 'تركيب شمسي تجاري',
  'Hybrid Solar System': 'منظومة شمسية هجينة',
};

const ARABIC_GOVERNORATES: Record<string, string> = {
  Baghdad: 'بغداد',
  Basra: 'البصرة',
  Erbil: 'أربيل',
};

const ARABIC_DISTRICTS: Record<string, string> = {
  'Al-Jadriya': 'الجادرية',
  'Industrial Zone': 'المنطقة الصناعية',
  'Al-Zubair': 'الزبير',
};

function localized(en: string, ar: string) {
  return { en, ar };
}

function reviewText(comment: string) {
  const marker = DEMO_REVIEW_MARKERS.find((prefix) => comment.startsWith(prefix));
  return marker ? comment.slice(marker.length).trimStart() : comment;
}

function toReview(review: ApiReview): Review {
  const initials = review.client_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('');
  const locationEn = `${review.location_governorate} · ${review.location_district}`;
  const locationAr = `${ARABIC_GOVERNORATES[review.location_governorate] ?? review.location_governorate} · ${ARABIC_DISTRICTS[review.location_district] ?? review.location_district}`;

  return {
    id: String(review.id),
    rating: review.rating,
    initials: localized(initials, initials),
    name: localized(review.client_name, review.client_name),
    role: review.is_verified
      ? localized('Verified customer', 'عميل موثّق')
      : localized('Illustrative data', 'بيانات توضيحية'),
    body: localized(reviewText(review.comment), reviewText(review.comment)),
    projectType: localized(`${review.system_kwp} kWp system`, `منظومة بقدرة ${review.system_kwp} kWp`),
    isVerified: review.is_verified,
    isDemo: review.is_demo === true,
    companyName: localized(
      review.company_name,
      ARABIC_COMPANY_NAMES[review.company_name] ?? review.company_name,
    ),
    projectTitle: localized(
      review.project_title,
      ARABIC_PROJECT_TITLES[review.project_title] ?? review.project_title,
    ),
    location: localized(locationEn, locationAr),
    systemKWp: review.system_kwp,
    communicationRating: review.communication_rating,
    workQualityRating: review.work_quality_rating,
    createdAt: review.created_at,
  };
}

export function CustomerReviews({ fullPage = false }: { fullPage?: boolean }) {
  const { t } = useLanguage();
  const demoPreviewEnabled = import.meta.env.DEV
    && import.meta.env.VITE_DEMO_REVIEW_PREVIEW_ENABLED === 'true';
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const displayedReviews = fullPage ? reviews : reviews.slice(0, HOMEPAGE_REVIEW_LIMIT);

  useEffect(() => {
    let cancelled = false;
    api.publicReviews(demoPreviewEnabled)
      .then((items) => {
        if (!cancelled) {
          const visible = items.filter((item) =>
            item.is_verified
            || (
              demoPreviewEnabled
              && item.is_demo === true
              && !item.is_verified
              && DEMO_REVIEW_MARKERS.some((marker) => item.comment.startsWith(marker))
            ),
          );
          setReviews(visible.map(toReview));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demoPreviewEnabled]);

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="section-y bg-[#faf8f5]">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <p className="eyebrow text-content-brand">{t('rv.eyebrow')}</p>
          <h2 id="reviews-heading" className="mt-3 text-h1 text-content-primary">
            {t('rv.h2')}
          </h2>
          <p className="readable-copy mt-3 text-body-lg text-content-secondary">{t('rv.lede')}</p>
        </Reveal>

        {loading ? (
          <p role="status" className="mt-10 border-y border-line-subtle py-8 text-body text-content-secondary">
            {t('rv.loading')}
          </p>
        ) : (
          <>
            {failed && (
              <p role="alert" className="mt-10 border-y border-line-subtle py-4 text-body-sm text-content-secondary">
                {t('rv.loadError')}
              </p>
            )}
            {reviews.length === 0 ? (
              <p className="mt-10 border-y border-line-subtle py-8 text-body text-content-secondary">
                {t('rv.empty')}
              </p>
            ) : (
              <div className="relative mt-10">
                <Reveal stagger as="ul" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {displayedReviews.map((review) => (
                    <RevealItem key={review.id} as="li" className="h-full">
                      <ReviewCard review={review} />
                    </RevealItem>
                  ))}
                </Reveal>
                {!fullPage && (
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      size="md"
                      trailingArrow
                      className="mx-auto mt-8 cursor-pointer rounded-xl border-0 bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-300 hover:from-amber-600 hover:to-amber-700 hover:shadow-amber-500/30"
                      onClick={() => { window.location.hash = '#/reviews'; }}
                    >
                      {t('rv.viewAll')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}