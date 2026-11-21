// Типы для postcssViewportZoom.js (плагин на JS: его грузит postcss.config.js).
export function divideViewportUnits(value: string): string;
declare function postcssViewportZoom(): {
  postcssPlugin: string;
  Declaration(decl: { prop: string; value: string }): void;
};
declare namespace postcssViewportZoom {
  let postcss: true;
}
export default postcssViewportZoom;
