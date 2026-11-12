import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router';

import { balanceApi } from '@/api/balance';
import { subscriptionApi } from '@/api/subscription';
import { LiteMeter } from '@/components/lite/LiteMeter';
import { LitePromoSlot } from '@/components/lite/LitePromoSlot';
import { LiteRow, LiteRowGroup } from '@/components/lite/LiteRow';
import SourceLink from '@/components/blackbird/SourceLink';
import { ArrowRightIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { API } from '@/config/constants';
import { useCurrency } from '@/hooks/useCurrency';
import { getApiErrorMessage } from '@/utils/api-error';
import { formatLiteDate } from '@/utils/liteDate';
import { formatTraffic } from '@/utils/formatTraffic';
import { liteStatus, type LiteAction } from '@/utils/liteStatus';

/**
 * Единственное главное действие экрана — ссылкой или кнопкой, вид один.
 * BlackBird B1: светлая плашка во всю ширину, текст слева, стрелка справа.
 */
const PRIMARY_ACTION_CLASS =
  'flex min-h-14 w-full items-center justify-between gap-4 rounded px-5 py-4 text-left font-display text-[17px] font-bold bg-accent-500 text-on-accent transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

/** Второе по важности действие (тарифы): та же форма, только контуром. */
const SECONDARY_ACTION_CLASS =
  'flex min-h-14 w-full items-center justify-between gap-4 rounded border border-dark-100 px-5 py-4 text-left font-display text-[17px] font-semibold text-dark-50 transition-colors hover:bg-dark-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';

/** Стрелка в главных кнопках. */
function ArrowIcon() {
  return <ArrowRightIcon className="h-5 w-5" />;
}

/** Подпись к крупному числу: «дня осталось», «часа осталось», «дней бесплатно». */
function HeroNumber({
  value,
  label,
  dim = false,
}: {
  value: number;
  label: string;
  dim?: boolean;
}) {
  return (
    <p className="mt-3 flex items-baseline gap-3">
      <span
        className={`font-display text-[120px] font-extrabold leading-[0.85] tracking-[-0.06em] tabular-nums ${dim ? 'text-dark-600' : 'text-dark-50'}`}
      >
        {value}
      </span>
      <span className="whitespace-pre-line font-display text-[22px] font-semibold leading-[1.1] text-dark-50">
        {label}
      </span>
    </p>
  );
}

/**
 * Простой вид главного экрана.
 *
 * Держит одно правило: на первом экране ровно одна фраза о состоянии, одна
 * шкала и одно действие. Всё, что человек делает реже раза в месяц, живёт на
 * странице подписки — она и есть «управление» второго уровня, отдельного
 * экрана под него заводить не пришлось.
 *
 * Полный вид (Dashboard) остаётся нетронутым: переключение — настройка
 * оператора, и откатиться он должен мгновенно.
 */
/** Ответ бэка на триал при уже выданной подписке (текст приходит по-английски). */
const ALREADY_SUBSCRIBED = /already have an active subscription/i;

export default function DashboardLite() {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();

  const {
    data: list,
    isLoading: listLoading,
    isError: listFailed,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
    // BlackBird: ссылки из бота открывают кабинет в НОВОЙ вкладке, старая
    // остаётся с устаревшим экраном («Попробовать бесплатно» у того, кто уже
    // взял триал → «You already have an active subscription»). Вкладка
    // переспрашивает подписку, когда к ней возвращаются.
    refetchOnWindowFocus: 'always',
  });

  const subscriptions = useMemo(() => list?.subscriptions ?? [], [list]);
  const isMultiTariff = list?.multi_tariff_enabled ?? false;
  const hasMany = isMultiTariff && subscriptions.length > 1;

  // В мультитарифе запрос без id возвращает пусто, поэтому единственную
  // подписку приходится спрашивать по её id — иначе на экране не будет ни
  // трафика, ни срока.
  const singleId = isMultiTariff && subscriptions.length === 1 ? subscriptions[0].id : undefined;
  const wantsSingle = Boolean(list) && !hasMany;

  const {
    data: subscriptionResponse,
    isLoading: subLoading,
    isError: subFailed,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: singleId ? ['subscription', singleId] : ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(singleId),
    enabled: wantsSingle,
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnWindowFocus: 'always',
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: balance } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  const { data: devices } = useQuery({
    queryKey: singleId ? ['devices', singleId] : ['devices'],
    queryFn: () => subscriptionApi.getDevices(singleId),
    enabled: Boolean(subscription),
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  // Пробный период предлагается ТОЛЬКО здесь: витрина тарифов его не включает,
  // она умеет лишь предлагать апгрейд уже начатому триалу. Без этого запроса
  // простой вид тихо прятал бы бесплатный вход от новых людей.
  const { data: trialInfo } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: wantsSingle && !subLoading && !subscription,
    retry: false,
    refetchOnWindowFocus: 'always',
  });

  const queryClient = useQueryClient();
  const [trialError, setTrialError] = useState<string | null>(null);

  const refreshAfterTrial = () => {
    for (const key of ['subscription', 'subscriptions-list', 'trial-info', 'balance']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const activateTrial = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      refreshAfterTrial();
    },
    onError: (error: unknown) => {
      // BlackBird: экран мог устареть (подписку уже выдали в другой вкладке или
      // в боте) — переспрашиваем всегда. «Подписка уже есть» — не ошибка для
      // человека: после обновления он увидит свою подписку, а не английский текст.
      refreshAfterTrial();
      const message = getApiErrorMessage(error, t('common.error'));
      setTrialError(ALREADY_SUBSCRIBED.test(message) ? null : message);
    },
  });

  const status = liteStatus(subscription);
  const subscriptionId = subscription?.id;
  const offersTrial = status.action === 'buy' && Boolean(trialInfo?.is_available);
  // Платный пробный период списывается с баланса. Если денег не хватает,
  // активация падает на стороне сервера, и кнопка «Попробовать» превращается
  // в тупик: ошибка без выхода. Поэтому в этом случае зовём пополнить —
  // ровно так же, как это делает полный вид.
  const trialNeedsTopUp =
    offersTrial &&
    Boolean(trialInfo?.requires_payment) &&
    (balance?.balance_kopeks ?? 0) < (trialInfo?.price_kopeks ?? 0);

  const actionPath: Record<LiteAction, string> = {
    connect: subscriptionId ? `/connection?sub=${subscriptionId}` : '/connection',
    renew: subscriptionId ? `/subscriptions/${subscriptionId}/renew` : '/subscription/purchase',
    buy: '/subscription/purchase',
    manage: subscriptionId ? `/subscriptions/${subscriptionId}` : '/subscriptions',
    chooseTariff: '/subscription/purchase',
  };

  const isLoading = listLoading || (wantsSingle && subLoading);

  // Отказ сети нельзя показывать как «подписки пока нет»: платящий человек
  // увидел бы предложение купить то, что у него уже есть, и решил бы, что
  // подписка пропала. Молчание здесь хуже ошибки.
  if (listFailed || subFailed) {
    return (
      <div className="mx-auto w-full max-w-lg pt-8">
        <div role="alert">
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-dark-50">
            {t('lite.error.load', 'Не удалось загрузить данные')}
          </h1>
          <p className="mt-3 text-[15px] text-dark-400">
            {t('lite.error.hint', 'Проверьте связь и повторите')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (listFailed) refetchList();
            if (subFailed) refetchSubscription();
          }}
          className={`${PRIMARY_ACTION_CLASS} mt-6`}
        >
          {t('lite.error.retry', 'Повторить')}
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <SkeletonGroup className="pb-7 pt-8">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-8 w-40" />
          <Skeleton className="mt-7 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-3 h-4 w-32" />
        </SkeletonGroup>
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    );
  }

  const kicker = subscription ? heroKicker(t, status.key, subscription.tariff_name) : null;
  const daysLeft = Math.max(0, subscription?.days_left ?? 0);
  const hoursLeft = Math.max(0, subscription?.hours_left ?? 0);
  // Последние сутки считаем часами: «0 дней осталось» у живой подписки
  // читается как «уже не работает».
  const showHours =
    Boolean(subscription) && status.key !== 'expired' && daysLeft === 0 && hoursLeft > 0;
  // Вторая кнопка ведёт к тарифам. Если главная уже ведёт туда же («Выбрать
  // тариф» после конца триала), вторая была бы дублем.
  const primaryGoesToPlans =
    !offersTrial && !trialNeedsTopUp && actionPath[status.action] === '/subscription/purchase';
  const showPlansButton =
    !hasMany && !primaryGoesToPlans && (offersTrial || Boolean(subscription?.is_trial));
  const deviceLimit = subscription?.device_limit ?? 0;
  const devicesUsed = devices?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-lg">
      {hasMany ? (
        <ManySubscriptions
          items={subscriptions.map((item) => ({
            id: item.id,
            name: item.tariff_name,
            endDate: item.end_date,
          }))}
        />
      ) : offersTrial && !subscription ? (
        <section className="pb-7 pt-8">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-dark-400">
            <span className="h-1.5 w-1.5 rounded-full bg-dark-50" aria-hidden="true" />
            {t('blackbird.trialOffer.kicker', 'Подарок новым пользователям')}
          </p>
          <h1 className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-[120px] font-extrabold leading-[0.85] tracking-[-0.06em] tabular-nums text-dark-50">
              {trialInfo?.duration_days ?? 0}
            </span>
            <span className="whitespace-pre-line font-display text-[22px] font-semibold leading-[1.1] text-dark-50">
              {t('blackbird.trialOffer.days', { count: trialInfo?.duration_days ?? 0 })}
            </span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-dark-400">
            {t(
              'blackbird.trialOffer.hint',
              'Попробуйте самый популярный тариф целиком, без урезанных функций.',
            )}
          </p>
          <dl className="mt-6 divide-y divide-dark-700/60 border-y border-dark-700/60">
            {(trialInfo?.device_limit ?? 0) > 0 && (
              <div className="flex items-center justify-between py-4 text-[15px]">
                <dt className="text-dark-400">{t('blackbird.trialOffer.devices', 'Устройства')}</dt>
                <dd className="font-semibold text-dark-50">
                  {t('blackbird.trialOffer.upTo', 'до {{n}}', { n: trialInfo?.device_limit })}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between py-4 text-[15px]">
              <dt className="text-dark-400">
                {t('blackbird.trialOffer.traffic', 'Трафик на период')}
              </dt>
              <dd className="font-semibold text-dark-50">
                {(trialInfo?.traffic_limit_gb ?? 0) > 0
                  ? formatTraffic(trialInfo?.traffic_limit_gb ?? 0)
                  : t('blackbird.trialOffer.unlimited', 'без лимита')}
              </dd>
            </div>
            {!trialInfo?.requires_payment && (
              <div className="flex items-center justify-between py-4 text-[15px]">
                <dt className="text-dark-400">{t('blackbird.trialOffer.card', 'Карта')}</dt>
                <dd className="font-semibold text-dark-50">
                  {t('blackbird.trialOffer.noCard', 'не нужна')}
                </dd>
              </div>
            )}
          </dl>
        </section>
      ) : (
        <section className="pb-7 pt-8">
          {kicker && (
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-dark-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${status.key === 'expired' ? 'border border-dark-400' : 'bg-dark-50'}`}
                aria-hidden="true"
              />
              {kicker}
            </p>
          )}
          {subscription &&
            (showHours ? (
              <HeroNumber
                value={hoursLeft}
                label={t('blackbird.hoursLeft', { count: hoursLeft })}
              />
            ) : (
              <HeroNumber
                value={status.key === 'expired' ? 0 : daysLeft}
                label={t('blackbird.daysLeft', { count: status.key === 'expired' ? 0 : daysLeft })}
                dim={status.key === 'expired'}
              />
            ))}
          <h1
            className={
              subscription
                ? 'mt-4 text-[15px] font-normal tracking-normal text-dark-400'
                : 'font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-dark-50'
            }
          >
            {t(`lite.status.${status.key}`, {
              date: formatLiteDate(status.date),
            })}
          </h1>
          {subscription && (
            <div className="mt-7 grid grid-cols-2 border-y border-dark-700/60">
              <div className="py-4 pr-4">
                <p className="text-xs text-dark-400">{t('lite.traffic.label', 'Трафик')}</p>
                <div className="mt-1.5">
                  <LiteMeter
                    large
                    usedGb={subscription.traffic_used_gb}
                    limitGb={subscription.traffic_limit_gb}
                    usedPercent={subscription.traffic_used_percent}
                  />
                </div>
              </div>
              <Link
                to={`/connection?sub=${subscription.id}`}
                className="border-l border-dark-700/60 py-4 pl-4 transition-colors hover:bg-dark-800/40"
              >
                <p className="text-xs text-dark-400">{t('lite.rows.devices', 'Устройства')}</p>
                <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-dark-50">
                  {devicesUsed}
                  {deviceLimit > 0 && (
                    <span className="text-sm font-medium text-dark-400"> / {deviceLimit}</span>
                  )}
                </p>
                {deviceLimit > 0 && deviceLimit <= 24 && (
                  <div
                    className="mt-3 grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${deviceLimit}, minmax(0, 1fr))` }}
                    aria-hidden="true"
                  >
                    {Array.from({ length: deviceLimit }, (_, i) => (
                      <span
                        key={i}
                        className={`h-0.5 ${i < devicesUsed ? 'bg-dark-50' : 'bg-dark-700/60'}`}
                      />
                    ))}
                  </div>
                )}
              </Link>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2.5">
        {!hasMany &&
          (trialNeedsTopUp ? (
            <Link to="/balance" className={PRIMARY_ACTION_CLASS}>
              {t('subscription.trial.topUpToActivate')}
              <ArrowIcon />
            </Link>
          ) : offersTrial ? (
            <button
              type="button"
              onClick={() => activateTrial.mutate()}
              disabled={activateTrial.isPending}
              className={`${PRIMARY_ACTION_CLASS} disabled:opacity-60`}
            >
              {trialInfo?.requires_payment
                ? t('lite.action.tryPaid', {
                    price: `${formatAmount(trialInfo.price_rubles)}\u00A0${currencySymbol}`,
                  })
                : t('lite.action.tryFree')}
              <ArrowIcon />
            </button>
          ) : (
            <Link to={actionPath[status.action]} className={PRIMARY_ACTION_CLASS}>
              {t(`lite.action.${status.action}`)}
              <ArrowIcon />
            </Link>
          ))}

        {showPlansButton && (
          <Link to="/subscription/purchase" className={SECONDARY_ACTION_CLASS}>
            {t('lite.rows.plans', 'Посмотреть тарифы')}
            <ArrowIcon />
          </Link>
        )}
      </div>

      {trialError && offersTrial && (
        <p className="mt-3 text-sm text-error-400" role="alert">
          {trialError}
        </p>
      )}

      <div className="mt-6 border-t border-dark-700/60">
        <LiteRowGroup>
          <LiteRow
            to="/balance"
            label={t('lite.rows.balance', 'Баланс')}
            value={`${formatAmount(balance?.balance_rubles ?? 0)}\u00A0${currencySymbol}`}
          />
          {subscription && (
            <LiteRow
              to={`/subscriptions/${subscription.id}`}
              label={t('lite.rows.manage', 'Управление подпиской')}
            />
          )}
          {hasMany && (
            <LiteRow
              to="/subscription/purchase"
              label={t('lite.rows.buyAnother', 'Купить ещё тариф')}
            />
          )}
          <LiteRow to="/support" label={t('lite.rows.support', 'Поддержка')} />
        </LiteRowGroup>
      </div>

      <div className="mt-2">
        <LitePromoSlot />
      </div>

      <SourceLink className="mt-8" />
    </div>
  );
}

/** Строка над крупным числом: «PRO · ПРОБНЫЙ ПЕРИОД». */
function heroKicker(t: TFunction, key: string, tariffName: string | null | undefined): string {
  const labels: Record<string, string> = {
    trial: t('blackbird.kicker.trial', 'пробный период'),
    active: t('blackbird.kicker.active', 'активна'),
    expiring: t('blackbird.kicker.expiring', 'скоро закончится'),
    expired: t('blackbird.kicker.expired', 'закончилась'),
    limited: t('blackbird.kicker.limited', 'трафик закончился'),
    paused: t('blackbird.kicker.paused', 'на паузе'),
    legacy: t('blackbird.kicker.legacy', 'нужен тариф'),
  };
  const label = labels[key] ?? '';
  return tariffName ? `${tariffName} · ${label}` : label;
}

interface ManySubscriptionsProps {
  items: { id: number; name: string | null; endDate: string | null }[];
}

/**
 * Несколько подписок: один экран начинается уже внутри конкретной подписки,
 * поэтому здесь — только выбор. Шкалы и кнопки действия тут нет намеренно:
 * они относятся к подписке, а не к их списку.
 */
function ManySubscriptions({ items }: ManySubscriptionsProps) {
  const { t } = useTranslation();

  return (
    <section className="pb-2 pt-8">
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-dark-50">
        {t('lite.status.many', 'Ваши подписки')}
      </h1>
      <div className="mt-6">
        <LiteRowGroup>
          {items.map((item) => (
            <LiteRow
              key={item.id}
              to={`/subscriptions/${item.id}`}
              label={item.name || t('lite.subscription.untitled', 'Подписка')}
              value={item.endDate ? formatLiteDate(item.endDate) : undefined}
            />
          ))}
        </LiteRowGroup>
      </div>
    </section>
  );
}
