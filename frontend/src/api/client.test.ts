import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, api, toCompany, type ApiCompany } from './client';

const companyPayload: ApiCompany = {
  id: 4,
  name: 'Verified Solar',
  logo_url: null,
  founded_year: 2015,
  projects_count: 12,
  phone: null,
  contact_phone: null,
  phone_number: null,
  address: 'Baghdad',
  verification_status: 'verified',
  rating: 4.8,
  reviews_count: 12,
};

describe('company support phone mapping', () => {
  it.each([
    [{ support_phone: '07999999999', phone: '07711111111' }, '07999999999'],
    [{ phone: '07711111111' }, '07711111111'],
    [{ phone: '  ', contact_phone: '07722222222' }, '07722222222'],
    [{ phone: null, contact_phone: null, phone_number: '07733333333' }, '07733333333'],
    [{ support_phone: '  ', phone: '07744444444' }, '07744444444'],
  ] as const)('prefers the support hotline and falls back to a public contact phone', (phoneFields, expectedPhone) => {
    expect(toCompany({ ...companyPayload, ...phoneFields }).supportPhone).toBe(expectedPhone);
  });
});

describe('API authentication headers', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('attaches the persisted bearer token to admin requests', async () => {
    localStorage.setItem('utu-auth-token', 'admin-jwt');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);

    await api.adminPendingCompanies();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/companies/admin/pending`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-jwt' }),
      }),
    );
  });

  it('requests pending company previews only when explicitly opted in', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);

    await api.listCompanies(true);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/companies?include_preview=true`,
      expect.any(Object),
    );
  });

  it('requests database seed reviews only when explicitly opted in', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);

    await api.publicReviews(true);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/reviews?include_demo=true`,
      expect.any(Object),
    );
  });
});
