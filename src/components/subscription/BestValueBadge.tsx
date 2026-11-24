import { useTranslation } from 'react-i18next';
import { StarIcon } from '@/components/icons';

/**
 * Отметка периода, выбранного оператором как самый выгодный.
 *
 * Цвет намеренно не accent и не success: accent уже означает «этот вариант
 * выбран», success — размер скидки. Третий смысл третьим цветом, иначе рядом со
 * скидкой «−25 %» отметка читается как её продолжение.
 */
export function BestValueBadge({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <span
      // BlackBird (24.11.2026): спокойная отметка в цветах палитры — без янтаря, капса и разрядки. Янтарный текст
      // в светлой теме имел контраст 1,4:1; у палитры один акцент, и он отдан выбору.
      className={`inline-flex items-center gap-1 rounded bg-dark-50/10 px-2 py-0.5 text-xs font-medium text-dark-100 ${className ?? ''}`}
    >
      <StarIcon filled className="h-3 w-3" />
      {t('subscription.bestValue')}
    </span>
  );
}

/** Цвет рамки выделенного периода — тот же токен, что и у отметки. */
// BlackBird: нейтральный контур, заметнее обычной рамки карточки
export const BEST_VALUE_BORDER = 'rgb(var(--color-dark-400))';

/**
 * Рамка отмеченного варианта — одна на все витрины: золотой контур снаружи,
 * а у выбранного ещё и кольцо выбора внутри. Выбор не затирает золото, иначе
 * подсказка пропадала ровно у того варианта, к которому вела. Плашку при этом
 * ставить первой строкой карточки. Продление рисует то же самое через
 * BEST_VALUE_BORDER — там стили карточки инлайновые.
 */
export function bestValueFrame(selected: boolean): string {
  // BlackBird: выбранный вариант — контур акцента; отметка «Выгодно» остаётся внутри карточки
  return selected ? 'border-2 border-accent-500' : 'border-2 border-dark-400';
}
