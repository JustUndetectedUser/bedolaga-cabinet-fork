// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/token', () => ({
  tokenStorage: { getAccessToken: () => 'tok123' },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_OFFERS_URL', '/invite/offers');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('blackbirdOffers', () => {
  it('fetchOffers шлёт Bearer и возвращает offers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ offers: [{ id: 'a' }] }),
    });
    const { fetchOffers } = await import('./blackbirdOffers');
    expect(await fetchOffers()).toEqual([{ id: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('/invite/offers', {
      headers: { Authorization: 'Bearer tok123' },
    });
  });

  it('401 бросает OffersHttpError со status 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const { fetchOffers, OffersHttpError } = await import('./blackbirdOffers');
    const err = await fetchOffers().catch((e) => e);
    expect(err).toBeInstanceOf(OffersHttpError);
    expect(err.status).toBe(401);
  });

  it('claimOffer: POST JSON с Bearer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'pending' }),
    });
    const { claimOffer } = await import('./blackbirdOffers');
    expect(await claimOffer('a')).toBe('pending');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/invite/offers/claim');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(init.body).toBe('{"id":"a"}');
  });
});
