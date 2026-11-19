import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useBlockingStore } from '../../../store/blocking';
import { landingEntryPending, releaseLandingEntry } from './landingEntry';

/** Страницы с глобусом: «Главная» и вход. На остальных глобуса-загрузки нет. */
const WITH_GLOBE = new Set(['/', '/login']);

/**
 * BlackBird: вход с лендинга (landingEntry.ts) прячет #root, пока страница не
 * готова, — на экране глобус как загрузка. Экрану, которому ждать нечего,
 * ожидание снимается сразу: экран блокировки (обслуживание, бэкенд недоступен,
 * подписка на канал, бан, удалённый аккаунт — он закрывает всё) и страница без
 * глобуса. Иначе человек смотрел бы на глобус до предела, когда кабинет уже
 * показал другое. Стоит внутри роутера, рядом с BlockingOverlay (App.tsx); в
 * дереве ничего не рисует.
 */
export function EntryGate(): null {
  const { pathname } = useLocation();
  const blocked = useBlockingStore((state) => state.blockingType !== null);
  useEffect(() => {
    if (landingEntryPending() && (blocked || !WITH_GLOBE.has(pathname))) releaseLandingEntry();
  }, [blocked, pathname]);
  return null;
}
