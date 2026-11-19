import { lazy, Suspense } from 'react';

import { earlyGlobe } from './earlyGlobe';

/**
 * BlackBird: глобус фоном «Главной» и экрана входа. Сам слой —
 * CabinetGlobeImpl.tsx, отдельным чанком: глобус и так появляется после
 * содержимого, а стартовый бандл кабинета не растёт. Свой Suspense: пока чанк
 * грузится, страница рисуется как без глобуса (слой ничего не рисует в дереве);
 * чанк не загрузился — глобуса нет, страница как без него.
 */
let chunk: ReturnType<typeof importImpl> | undefined;
const importImpl = () =>
  import('./CabinetGlobeImpl').then(
    (m) => ({ default: m.CabinetGlobe }),
    () => ({ default: () => null }),
  );
const load = () => (chunk ??= importImpl());

// Вход с лендинга: глобус уже грузит инлайн-скрипт index.html (earlyGlobe.ts),
// а забирает его слой этот чанк — запросить сразу, не дожидаясь страницы.
if (earlyGlobe()) void load();

const Impl = lazy(load);

export function CabinetGlobe(props: { onReady?: () => void; keepOnly?: boolean; busy?: boolean }) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
