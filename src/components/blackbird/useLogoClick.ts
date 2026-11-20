import type { MouseEvent } from 'react';
import { useLocation } from 'react-router';

import { usePlatform } from '@/platform';

import { leaveForLanding } from './globe/landingReturn';

/**
 * Адрес лендинга. Задаётся при сборке (VITE_LANDING_URL); без него логотип
 * ведёт на главную, как в апстриме.
 */
const LANDING_URL = import.meta.env.VITE_LANDING_URL || '';

/**
 * BlackBird: адрес лендинга с темой кабинета (?theme=light|dark, по классу
 * <html> в момент клика): лендинг её применяет и запоминает (assets/theme.js
 * роли landing) — тема одна на лендинге и в кабинете. Прочие части адреса
 * остаются.
 */
function landingHref(): string {
  const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  try {
    const url = new URL(LANDING_URL);
    url.searchParams.set('theme', theme);
    return url.toString();
  } catch {
    return LANDING_URL;
  }
}

/**
 * BlackBird: клик по логотипу в шапке.
 *
 * Не на главной — обычный переход на главную (`<Link to="/">`).
 * Уже на главной — на лендинг в теме кабинета: в вебе в той же вкладке, в
 * Mini App — через Telegram (openLink), чтобы не уводить сам Mini App со
 * страницы. В вебе с глобусом на экране — возврат с глобусом: интерфейс гаснет,
 * адрес с меткой возврата (globe/landingReturn.ts).
 */
export function useLogoClick(onClick?: () => void) {
  const { pathname } = useLocation();
  const { platform, openLink } = usePlatform();

  return (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    if (!LANDING_URL || pathname !== '/') return;
    // Ctrl/Cmd/Shift/Alt-клик и не левая кнопка — «открыть в новой вкладке»: это делает сам браузер,
    // текущую вкладку на лендинг не уводим
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;

    event.preventDefault();
    if (platform === 'telegram') openLink(landingHref());
    else leaveForLanding(landingHref());
  };
}
