import type { MouseEvent } from 'react';
import { useLocation } from 'react-router';

import { usePlatform } from '@/platform';

/**
 * Адрес лендинга. Задаётся при сборке (VITE_LANDING_URL); без него логотип
 * ведёт на главную, как в апстриме.
 */
const LANDING_URL = import.meta.env.VITE_LANDING_URL || '';

/**
 * BlackBird: клик по логотипу в шапке.
 *
 * Не на главной — обычный переход на главную (`<Link to="/">`).
 * Уже на главной — на лендинг: в вебе в той же вкладке, в Mini App —
 * через Telegram (openLink), чтобы не уводить сам Mini App со страницы.
 */
export function useLogoClick(onClick?: () => void) {
  const { pathname } = useLocation();
  const { platform, openLink } = usePlatform();

  return (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    if (!LANDING_URL || pathname !== '/') return;

    event.preventDefault();
    if (platform === 'telegram') openLink(LANDING_URL);
    else window.location.assign(LANDING_URL);
  };
}
