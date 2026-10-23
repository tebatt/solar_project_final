import { useEffect, useState } from 'react';
import { api, type ApiReview } from './client';

/**
 * Demo reviews ("بيانات توضيحية") are shown only on the dev server with
 * VITE_DEMO_REVIEW_PREVIEW_ENABLED=true (the same check as CustomerReviews);
 * a real deployment shows verified reviews only.
 */
export function demoReviewPreviewEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEMO_REVIEW_PREVIEW_ENABLED === 'true';
}

const DEMO_REVIEW_MARKERS = [
  'بيانات توضيحية:',
  'Seeded demo review (not customer testimony):',
  'تقييم تجريبي غير حقيقي ولا يمثل شهادة عميل:',
];

/** Whether a review from the API is one the reviews section shows. */
export function isShownReview(item: ApiReview, demoPreview = demoReviewPreviewEnabled()): boolean {
  return item.is_verified
    || (
      demoPreview
      && item.is_demo === true
      && !item.is_verified
      && DEMO_REVIEW_MARKERS.some((marker) => item.comment.startsWith(marker))
    );
}

export type ShownReviewStats = { count: number; average: number | null };

/**
 * Count and average rating of the reviews the reviews section shows, for the
 * hero figures while the demo preview is on. Returns null otherwise (and while
 * loading), so the hero keeps its verified-only figures.
 */
export function useShownReviewStats(): ShownReviewStats | null {
  const [stats, setStats] = useState<ShownReviewStats | null>(null);

  useEffect(() => {
    if (!demoReviewPreviewEnabled()) return;
    let cancelled = false;
    api.publicReviews(true)
      .then((items) => {
        if (cancelled) return;
        const shown = items.filter((item) => isShownReview(item));
        const average = shown.length
          ? shown.reduce((sum, item) => sum + item.rating, 0) / shown.length
          : null;
        setStats({ count: shown.length, average });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
