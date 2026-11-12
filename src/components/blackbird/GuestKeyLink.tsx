import { useTranslation } from 'react-i18next';

/**
 * «Нет доступа к Telegram? Получить разовый ключ» под карточкой входа.
 *
 * Вход в кабинет — только через Telegram, а у человека без VPN Telegram не
 * открывается. Ссылка ведёт на страницу разового ключа (сервис guest-key,
 * тот же домен, маршрут Caddy /guest — не страница кабинета, поэтому
 * обычная ссылка, а не переход роутера). Адрес задаётся при сборке
 * (VITE_GUEST_URL); без него ссылки нет, как в апстриме. В Mini App не
 * показывается: там Telegram уже открыт.
 */
export default function GuestKeyLink({ inTelegram = false }: { inTelegram?: boolean }) {
  const { t } = useTranslation();
  const url = import.meta.env.VITE_GUEST_URL;

  if (!url || inTelegram) return null;

  // Не сноска, а кнопка того же веса, что «Войти через бота» (Никита, 12.11): кто без Telegram,
  // упирается в карточку входа и не должен пропустить выход из неё.
  return (
    <div className="flex flex-col items-center">
      <div className="my-4 h-px w-full bg-dark-700" />
      <p className="mb-3 text-center text-sm text-dark-300">
        {t('blackbird.guest.question', 'Нет доступа к Telegram?')}
      </p>
      <a
        href={url}
        className="inline-flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/50 px-6 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-600 hover:bg-dark-800"
      >
        <svg
          className="h-5 w-5 text-accent-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.7 12.3 21 2M17 6l3 3M14.5 8.5l2 2" />
        </svg>
        {t('blackbird.guest.link', 'Получить разовый ключ')}
      </a>
    </div>
  );
}
