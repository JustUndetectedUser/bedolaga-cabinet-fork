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

  return (
    <>
      <div className="my-4 h-px bg-dark-700" />
      <p className="text-center text-sm text-dark-400">
        {t('blackbird.guest.question', 'Нет доступа к Telegram?')}{' '}
        <a href={url} className="text-accent-400 transition-colors hover:text-accent-300">
          {t('blackbird.guest.link', 'Получить разовый ключ')}
        </a>
      </p>
    </>
  );
}
