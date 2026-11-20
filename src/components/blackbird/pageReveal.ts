/**
 * BlackBird: загрузка разделов кабинета (решение владельца 20.11). Раньше,
 * пока раздел ждал данных, были видны серые полосы-скелетоны, а потом резко
 * появлялась страница другой формы — «скачет». Теперь пока данных нет, на
 * экране только шапка и глобус: группы скелетонов, строки-скелетоны и крутилка
 * страницы первые 2 с не видны (blackbird.css, bb-late; дольше — проявляются,
 * чтобы не казалось, что всё зависло). А содержимое, которое пришло на место
 * скелетона, проявляется плавно (класс bb-reveal-in на время анимации).
 *
 * Скелетон — группа SkeletonGroup (role="status", aria-busy="true") или
 * одиночный Skeleton (animate-pulse с заливкой bg-dark-500/…). «На место» —
 * в том же родителе, в одном обновлении DOM (React вставляет новое и убирает
 * старое в одном коммите: записи MutationObserver приходят одним вызовом).
 */

// селектор распознавания, а не вёрстка: части порознь, чтобы сторож инлайновых скелетонов
// (ui/skeleton/skeletonUsage.test.ts: пульс и заливка в одном литерале) его не путал со скелетоном
const SKELETON = [
  '[role="status"][aria-busy="true"], .animate-pulse',
  '[class*="bg-dark-500/"]',
].join('');
const REVEAL = 'bb-reveal-in';

function isSkeleton(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches(SKELETON) || node.querySelector(SKELETON) !== null;
}

function reveal(el: Element): void {
  el.classList.add(REVEAL);
  el.addEventListener('animationend', () => el.classList.remove(REVEAL), { once: true });
}

/** Следить за документом; вернуть — перестать. */
export function installPageReveal(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view || typeof view.MutationObserver !== 'function' || !doc.body) return () => {};
  const mo = new view.MutationObserver((records) => {
    // родители, у которых в этом обновлении ушёл скелетон
    const freed = new Set<Node>();
    for (const r of records) {
      for (const n of r.removedNodes) if (isSkeleton(n)) freed.add(r.target);
    }
    if (!freed.size) return;
    for (const r of records) {
      if (!freed.has(r.target)) continue;
      for (const n of r.addedNodes)
        if (n instanceof Element && n.isConnected && !isSkeleton(n)) reveal(n);
    }
  });
  mo.observe(doc.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
