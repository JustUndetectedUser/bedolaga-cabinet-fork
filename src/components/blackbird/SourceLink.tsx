import { useTranslation } from 'react-i18next';

/**
 * Ссылка на исходный код этой сборки кабинета.
 *
 * Кабинет распространяется по AGPL-3.0: тем, кто пользуется изменённой
 * версией по сети, нужно дать способ получить её исходники (раздел 13
 * лицензии). Адрес задаётся при сборке (VITE_SOURCE_URL) — сборка в CI
 * подставляет адрес своего репозитория. Без него ссылка ведёт на апстрим,
 * чтобы экран не остался совсем без неё.
 */
const SOURCE_URL =
  import.meta.env.VITE_SOURCE_URL || 'https://github.com/BEDOLAGA-DEV/bedolaga-cabinet';

export default function SourceLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <p className={`text-center text-[11px] leading-relaxed text-dark-500 ${className}`}>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-dark-300"
      >
        {t('blackbird.source', 'Исходный код')}
      </a>{' '}
      · AGPL-3.0
    </p>
  );
}
