import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { claimOffer, fetchOffers } from '@/api/blackbirdOffers';
import { useToast } from '@/components/Toast';
import { tokenStorage } from '@/utils/token';

const KEY = ['blackbird-offers'];

/**
 * Карточки «уникальный тариф» наверху главной: по одной на предложение
 * промогруппы. open — кнопка заявки, pending — строка состояния. Без
 * VITE_OFFERS_URL, при ошибке (в т.ч. 401) и пустом списке ничего не рисует.
 * title/text — обычный текст, React экранирует.
 */
export default function PromoOfferCard() {
  // VITE_OFFERS_URL подставляется при сборке: без него ни запросов, ни опроса токена
  if (!import.meta.env.VITE_OFFERS_URL) return null;
  return <PromoOfferCards />;
}

function PromoOfferCards() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Токен в ключе: обновление входа кабинетом (оно пишет только в sessionStorage,
  // сигнала в сторе нет) даёт новый ключ и перезапрос, а не карточку, скрытую
  // после 401 на минуту. Опрос раз в 5 с — копеечный (чтение sessionStorage).
  const [token, setToken] = useState(() => tokenStorage.getAccessToken());
  useEffect(() => {
    const timer = setInterval(() => setToken(tokenStorage.getAccessToken()), 5000);
    return () => clearInterval(timer);
  }, []);

  const { data } = useQuery({
    queryKey: [...KEY, token],
    queryFn: fetchOffers,
    enabled: !!token,
    staleTime: 60_000,
    retry: (count, err) => {
      const status = (err as { status?: number }).status;
      return !(status !== undefined && status >= 400 && status < 500) && count < 2;
    },
  });

  // Неудачное нажатие — как ответ бота на кнопку: 404/409 — предложения больше
  // нет (ссылку отозвали, решение уже принято); остальное (сеть, 5xx, истёкший
  // вход) — «попробуйте ещё раз». Перезапрос списка — в любом случае.
  const claim = useMutation({
    mutationFn: (id: string) => claimOffer(id),
    onError: (err) => {
      const status = (err as { status?: number }).status;
      const gone = status === 404 || status === 409;
      showToast({
        type: gone ? 'info' : 'error',
        message: gone
          ? t('blackbird.offer.gone', 'Предложение больше не доступно')
          : t('blackbird.offer.retry', 'Не получилось, попробуйте ещё раз'),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  if (!data || data.length === 0) return null;

  return (
    <>
      {data.map((offer) => (
        <div key={offer.id} className="rounded-2xl border border-accent-500/30 bg-dark-800/50 p-4">
          <p className="font-bold text-dark-50">{offer.title}</p>
          <p className="mt-1 text-sm text-dark-300">{offer.text}</p>
          {offer.state === 'open' ? (
            <button
              type="button"
              disabled={claim.isPending}
              onClick={() => claim.mutate(offer.id)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent-500/50 bg-accent-500/10 px-4 py-2 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('blackbird.offer.button', 'Вам доступен уникальный тариф')}
            </button>
          ) : (
            <p className="mt-3 text-sm text-dark-200">
              {t('blackbird.offer.pending', '⏳ Заявка на рассмотрении')}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
