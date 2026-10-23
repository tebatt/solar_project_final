import { useEffect, useState } from 'react';
import { api, toCompany } from './client';
import type { Company } from '../data/content';

export type CompaniesSource = 'loading' | 'api' | 'unavailable';

/**
 * Shared across every caller, so the three components that need the company
 * list on one screen make one request between them rather than three.
 * Module-level on purpose: it lives as long as the page does and resets on
 * reload, which is the right lifetime for a list that rarely changes.
 */
const inFlight = new Map<boolean, Promise<Company[] | null>>();
const cachedAt = new Map<boolean, number>();
const CACHE_TTL_MS = 15_000;

export function invalidateCompanies() {
  inFlight.clear();
  cachedAt.clear();
}

function fetchOnce(includePreview: boolean): Promise<Company[] | null> {
  const currentRequest = inFlight.get(includePreview);
  if (currentRequest && Date.now() - (cachedAt.get(includePreview) ?? 0) < CACHE_TTL_MS) {
    return currentRequest;
  }

  cachedAt.set(includePreview, Date.now());
  const request = Promise.all([
    api.listCompanies(includePreview),
    api.publicReviews().catch(() => null),
  ])
    .then(([rows, reviews]) => {
      const verifiedRatings = new Map<number, number[]>();
      for (const review of reviews ?? []) {
        if (!review.is_verified || !Number.isFinite(review.rating) || review.rating < 1 || review.rating > 5) continue;
        const scores = verifiedRatings.get(review.company_id) ?? [];
        scores.push(review.rating);
        verifiedRatings.set(review.company_id, scores);
      }
      return rows
        .filter((row) =>
          row.verification_status === 'identity_verified'
          || row.verification_status === 'verified'
          || (includePreview && row.is_preview === true && row.verification_status === 'pending'),
        )
        .map((row) => {
          const scores = verifiedRatings.get(row.id);
          const company = toCompany(row);
          return scores?.length
            ? {
                ...company,
                rating: scores.reduce((sum, rating) => sum + rating, 0) / scores.length,
                reviews: scores.length,
              }
            : company;
        });
    })
    .catch(() => {
      // Clear it so a later mount can retry rather than inheriting a failure.
      inFlight.delete(includePreview);
      cachedAt.delete(includePreview);
      return null;
    });
  inFlight.set(includePreview, request);
  return request;
}

/**
 * Approved companies are always eligible; pending companies are accepted only
 * for a caller that explicitly requests the separately gated preview list.
 *
 * `source` is returned rather than kept private so a screen can say where its
 * data came from. A prototype that quietly shows sample data as if it were
 * live is the kind of thing that gets believed in a demo and discovered later.
 */
export function useCompanies(
  { includePreview = false }: { includePreview?: boolean } = {},
): { companies: Company[]; source: CompaniesSource } {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [source, setSource] = useState<CompaniesSource>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchOnce(includePreview).then((rows) => {
        if (cancelled) return;
        if (rows === null) {
          setSource('unavailable');
          setCompanies([]);
          return;
        }
        setCompanies(rows);
        setSource('api');
      });
    };

    load();
    const refreshTimer = window.setInterval(load, CACHE_TTL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [includePreview]);

  return { companies, source };
}
