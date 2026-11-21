// BlackBird: the cabinet on a large window (larger than 1440x800 on both sides) is the cabinet of a 1440x800-class
// window scaled up whole: <body> gets CSS zoom (the head script of index.html sets --bb-zoom, blackbird.css applies it).
// Inside a zoomed element viewport units grow with the zoom (100vh would be 1.6 windows high at zoom 1.6), so every
// length in viewport units is divided by --bb-vz: the zoom of the element (body sets it, the globe layer and the Radix
// popper wrappers, back at zoom 1, reset it to 1). Outside the zoom, and on a smaller window, --bb-vz is not set and
// the value is the same as before (calc(100vh / 1)).
// Custom properties are left as they are: a var() in them would be resolved where they are declared, not where used
// (the cabinet's CSS has none with viewport units; divideViewportUnits.test.ts keeps it so).

const UNIT = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+))(vw|vh|dvw|dvh|svw|svh|lvw|lvh|vmin|vmax)\b/g;

export function divideViewportUnits(value) {
  return value.replace(UNIT, (_, pre, n, unit) => `${pre}calc(${n}${unit} / var(--bb-vz, 1))`);
}

export default function postcssViewportZoom() {
  return {
    postcssPlugin: 'bb-viewport-zoom',
    Declaration(decl) {
      if (decl.prop.startsWith('--') || decl.value.includes('--bb-vz')) return;
      const value = divideViewportUnits(decl.value);
      if (value !== decl.value) decl.value = value;
    },
  };
}
postcssViewportZoom.postcss = true;
