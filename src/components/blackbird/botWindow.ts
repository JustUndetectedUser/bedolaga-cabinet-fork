import type { MouseEvent } from 'react';

import { isInTelegramWebApp } from '@/hooks/useTelegramSDK';

/**
 * BlackBird: вкладка t.me, которую открывает кнопка «Открыть бота для входа».
 *
 * Апстрим открывал её обычной ссылкой с rel="noopener": кабинет не знал о
 * вкладке и закрыть её не мог. Человек подтверждал вход в Telegram,
 * возвращался в браузер и видел страницу t.me с переходом в бота, а кабинет
 * с уже выполненным входом оставался в соседней вкладке.
 *
 * Теперь вкладку открывает скрипт и держит на неё ссылку, а после успешного
 * входа закрывает: браузер сам возвращает человека на вкладку кабинета.
 * Закрыть чужую страницу скрипт вправе только так, без noopener, поэтому
 * t.me получает window.opener. Это домен самого Telegram, которому вход и так
 * доверен.
 *
 * Одна вкладка на всё приложение: повторное нажатие заменяет ссылку, прежняя
 * вкладка остаётся человеку.
 */
let botWindow: Window | null = null;

/**
 * Обработчик нажатия на ссылку бота. Если вкладку открыть не удалось
 * (блокировщик всплывающих окон), ничего не отменяет: сработает сама ссылка,
 * как в апстриме.
 */
export function openBotWindow(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  // Ctrl/Cmd/Shift/Alt-клик и не левая кнопка: человек сам выбрал, где открыть,
  // и такую вкладку не трогаем
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;

  // В Mini App window.open перехватывает сам Telegram и вкладки не даёт: там
  // остаётся обычная ссылка (и вход там идёт без этой кнопки)
  if (isInTelegramWebApp()) return;

  // biome-ignore lint: нужна ссылка на вкладку, чтобы закрыть её после входа; openLink её не возвращает
  const opened = window.open(url, '_blank');
  if (!opened) return;

  event.preventDefault();
  botWindow = opened;
}

/** Закрывает вкладку бота, если она открыта кнопкой и человек её ещё не закрыл. */
export function closeBotWindow(): void {
  const opened = botWindow;
  botWindow = null;
  if (!opened || opened.closed) return;
  try {
    opened.close();
  } catch {
    // вкладка уже недоступна: закрывать нечего
  }
}
