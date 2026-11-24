/**
 * BlackBird (ревью unslop, 24.11.2026): ширина колонки по правилу, а не по тому, как сложилось в upstream.
 * Экраны одного действия (подписка, продление, покупка, пополнение) — узкая колонка 640 px, обзорные (баланс,
 * рефералы, профиль, поддержка) — во всю ширину оболочки. Главная остаётся со своей колонкой (макет форка),
 * у подарков 640 px заданы в самой странице. Ширину ставит blackbird.css по метке data-bb-narrow на <main>.
 */
const NARROW = [
  /^\/subscription$/,
  /^\/subscription\/purchase$/,
  /^\/subscriptions\/[^/]+$/,
  /^\/subscriptions\/[^/]+\/renew$/,
  /^\/balance\/top-up$/,
  /^\/balance\/top-up\/(?!result(?:\/|$))[^/]+$/,
];

export function isNarrowPage(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return NARROW.some((re) => re.test(path));
}
