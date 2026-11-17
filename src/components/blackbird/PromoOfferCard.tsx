import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { claimOffer, fetchOffers } from "@/api/blackbirdOffers";

const KEY = ["blackbird-offers"];

/**
 * Карточки «уникальный тариф» наверху главной: по одной на предложение
 * промогруппы. open — кнопка заявки, pending — строка состояния. Без
 * VITE_OFFERS_URL, при ошибке (в т.ч. 401) и пустом списке ничего не рисует.
 * title/text — обычный текст, React экранирует.
 */
export default function PromoOfferCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const url = import.meta.env.VITE_OFFERS_URL;

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: fetchOffers,
    enabled: !!url,
    staleTime: 60_000,
    retry: (count, err) => {
      const status = (err as { status?: number }).status;
      return (
        !(status !== undefined && status >= 400 && status < 500) && count < 2
      );
    },
  });

  const claim = useMutation({
    mutationFn: (id: string) => claimOffer(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  if (!url || !data || data.length === 0) return null;

  return (
    <>
      {data.map((offer) => (
        <div
          key={offer.id}
          className="rounded-2xl border border-accent-500/30 bg-dark-800/50 p-4"
        >
          <p className="font-bold text-dark-50">{offer.title}</p>
          <p className="mt-1 text-sm text-dark-300">{offer.text}</p>
          {offer.state === "open" ? (
            <button
              type="button"
              disabled={claim.isPending}
              onClick={() => claim.mutate(offer.id)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent-500/50 bg-accent-500/10 px-4 py-2 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("blackbird.offer.button", "🎁 Вам доступен уникальный тариф")}
            </button>
          ) : (
            <p className="mt-3 text-sm text-dark-200">
              {t("blackbird.offer.pending", "⏳ Заявка на рассмотрении")}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
