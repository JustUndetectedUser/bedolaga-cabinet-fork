// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Карточка «уникальный тариф» на главной: open — кнопка (claim и перезапрос),
 * pending — строка состояния; пусто / ошибка / нет URL — ничего. Неудачное
 * нажатие — всплывающее сообщение, как ответ бота: сбой — «попробуйте ещё раз»,
 * 404/409 — «больше не доступно».
 */

let token: string | null = 't1';
vi.mock('@/utils/token', () => ({ tokenStorage: { getAccessToken: () => token } }));
const fetchOffers = vi.fn();
const claimOffer = vi.fn();
vi.mock('@/api/blackbirdOffers', () => ({
  fetchOffers: (...a: unknown[]) => fetchOffers(...a),
  claimOffer: (...a: unknown[]) => claimOffer(...a),
}));

beforeEach(() => {
  vi.resetModules();
  token = 't1';
  fetchOffers.mockReset();
  claimOffer.mockReset();
  vi.stubEnv('VITE_OFFERS_URL', '/invite/offers');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderCard() {
  const { default: PromoOfferCard } = await import('./PromoOfferCard');
  // после vi.resetModules — тот же экземпляр модуля, что видит карточка (иначе другой контекст)
  const { ToastProvider } = await import('@/components/Toast');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <div data-testid="card">
          <PromoOfferCard />
        </div>
      </ToastProvider>
    </QueryClientProvider>,
  );
  // container — только место карточки: область всплывающих сообщений рисует ToastProvider рядом
  return { ...view, container: view.getByTestId('card') };
}

const BUTTON = '🎁 Вам доступен уникальный тариф';
const RETRY = 'Не получилось, попробуйте ещё раз';
const GONE = 'Предложение больше не доступно';

const open = {
  id: 'a',
  title: 'Тариф Про',
  text: 'Скидка для вас',
  state: 'open',
};

describe('PromoOfferCard', () => {
  it('open: заголовок, текст, кнопка; нажатие вызывает claim и перезапрос', async () => {
    fetchOffers.mockResolvedValueOnce([open]);
    claimOffer.mockResolvedValue('pending');
    await renderCard();
    expect(await screen.findByText('Тариф Про')).toBeTruthy();
    expect(screen.getByText('Скидка для вас')).toBeTruthy();
    fetchOffers.mockResolvedValue([{ ...open, state: 'pending' }]);
    fireEvent.click(screen.getByRole('button', { name: '🎁 Вам доступен уникальный тариф' }));
    await waitFor(() => expect(claimOffer).toHaveBeenCalledWith('a'));
    expect(await screen.findByText('⏳ Заявка на рассмотрении')).toBeTruthy();
    expect(fetchOffers).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['сеть (fetch не дошёл)', new TypeError('Failed to fetch')],
    ['5xx', Object.assign(new Error('offers: HTTP 502'), { status: 502 })],
  ])(
    'сбой нажатия (%s): «попробуйте ещё раз», перезапрос, кнопка остаётся',
    async (_name, error) => {
      fetchOffers.mockResolvedValue([open]);
      claimOffer.mockRejectedValue(error);
      await renderCard();
      fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
      expect(await screen.findByText(RETRY)).toBeTruthy();
      expect(screen.queryByText(GONE)).toBeNull();
      await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
    },
  );

  it.each([404, 409])(
    'нажатие, а предложения уже нет (%s): «больше не доступно», карточка уходит',
    async (status) => {
      fetchOffers.mockResolvedValueOnce([open]);
      claimOffer.mockRejectedValue(Object.assign(new Error(`offers: HTTP ${status}`), { status }));
      const { container } = await renderCard();
      fetchOffers.mockResolvedValue([]);
      fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
      expect(await screen.findByText(GONE)).toBeTruthy();
      expect(screen.queryByText(RETRY)).toBeNull();
      await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText('Тариф Про')).toBeNull());
      expect(container.querySelector('button')).toBeNull();
    },
  );

  it('удачное нажатие — без всплывающих сообщений', async () => {
    fetchOffers.mockResolvedValueOnce([open]);
    claimOffer.mockResolvedValue('member');
    await renderCard();
    fetchOffers.mockResolvedValue([]);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(RETRY)).toBeNull();
    expect(screen.queryByText(GONE)).toBeNull();
  });

  it('pending: строка состояния без кнопки', async () => {
    fetchOffers.mockResolvedValue([{ ...open, state: 'pending' }]);
    await renderCard();
    expect(await screen.findByText('⏳ Заявка на рассмотрении')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('пустой список — ничего', async () => {
    fetchOffers.mockResolvedValue([]);
    const { container } = await renderCard();
    await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('ошибка — ничего', async () => {
    fetchOffers.mockRejectedValue(new Error('401'));
    const { container } = await renderCard();
    await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('401, затем новый токен: перезапрос и карточка появляется', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchOffers.mockRejectedValueOnce(Object.assign(new Error('401'), { status: 401 }));
      const { container } = await renderCard();
      await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(1));
      expect(container.innerHTML).toBe('');
      fetchOffers.mockResolvedValue([open]);
      token = 't2';
      await vi.advanceTimersByTimeAsync(5100);
      expect(await screen.findByText('Тариф Про')).toBeTruthy();
      expect(fetchOffers).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('без токена запроса нет', async () => {
    token = null;
    const { container } = await renderCard();
    expect(container.innerHTML).toBe('');
    expect(fetchOffers).not.toHaveBeenCalled();
  });

  it('без VITE_OFFERS_URL — ничего и без запроса', async () => {
    vi.stubEnv('VITE_OFFERS_URL', '');
    const { container } = await renderCard();
    expect(container.innerHTML).toBe('');
    expect(fetchOffers).not.toHaveBeenCalled();
  });
});
