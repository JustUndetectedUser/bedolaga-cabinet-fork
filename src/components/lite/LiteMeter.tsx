import { useTranslation } from 'react-i18next';

import { formatTraffic } from '@/utils/formatTraffic';
import { liteMeterColor, liteMeterWidth } from '@/utils/liteMeter';

interface LiteMeterProps {
  usedGb: number;
  limitGb: number;
  usedPercent: number;
  /**
   * BlackBird B1: крупные цифры над шкалой («12,4 / 75 ГБ») — для плитки на
   * главной. По умолчанию — строка под шкалой, как в апстриме.
   */
  large?: boolean;
}

/**
 * Остаток трафика одной полосой.
 *
 * Полоса намеренно тонкая и без подложки-карточки: на простом экране она стоит
 * прямо под фразой о подписке и читается как её продолжение, а не как отдельный
 * виджет. Цифры — табличными знаками, иначе значение прыгает по ширине при
 * каждом обновлении и полоса «дышит».
 */
export function LiteMeter({ usedGb, limitGb, usedPercent, large = false }: LiteMeterProps) {
  const { t } = useTranslation();

  if (!limitGb || limitGb <= 0) {
    return (
      <p className="text-sm text-dark-400">
        {t('lite.traffic.unlimited', 'Трафик без ограничений')}
      </p>
    );
  }

  const width = liteMeterWidth(usedPercent);
  const color = liteMeterColor(usedPercent);

  if (large) {
    return (
      <div>
        <p className="font-display text-2xl font-bold tabular-nums text-dark-50">
          {formatTraffic(usedGb)}{' '}
          <span className="text-sm font-medium text-dark-400">/ {formatTraffic(limitGb)}</span>
        </p>
        <div
          className="mt-3 h-0.5 w-full overflow-hidden bg-dark-700/60"
          role="progressbar"
          aria-valuenow={Math.round(width)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('lite.traffic.label', 'Трафик')}
        >
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{ width: `${width}%`, background: color }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="h-0.5 w-full overflow-hidden bg-dark-700/60"
        role="progressbar"
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('lite.traffic.label', 'Трафик')}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <p className="mt-2 text-sm tabular-nums text-dark-400">
        {t('lite.traffic.used', '{{used}} из {{total}}', {
          used: formatTraffic(usedGb),
          total: formatTraffic(limitGb),
        })}
      </p>
    </div>
  );
}

export default LiteMeter;
