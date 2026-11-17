import { tokenStorage } from '@/utils/token';

/**
 * BlackBird: уникальные тарифы промогрупп. Сервис guest-key (тот же домен,
 * VITE_OFFERS_URL). Намеренно обычный fetch, а не axios-клиент кабинета: его
 * перехватчики приняли бы 401 от guest-key за сбой сессии кабинета.
 */
export type Offer = {
  id: string;
  title: string;
  text: string;
  state: 'open' | 'pending';
};

export class OffersHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`offers: HTTP ${status}`);
    this.status = status;
  }
}

function headers(json = false): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${tokenStorage.getAccessToken() ?? ''}`,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function fetchOffers(): Promise<Offer[]> {
  const url = import.meta.env.VITE_OFFERS_URL;
  if (!url) return [];
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new OffersHttpError(res.status);
  const data = (await res.json()) as { offers?: Offer[] };
  return Array.isArray(data.offers) ? data.offers : [];
}

export async function claimOffer(id: string): Promise<string> {
  const url = import.meta.env.VITE_OFFERS_URL;
  if (!url) throw new Error('offers: no url');
  const res = await fetch(`${url}/claim`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new OffersHttpError(res.status);
  const data = (await res.json()) as { state?: string };
  return data.state ?? '';
}
