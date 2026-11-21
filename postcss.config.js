import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import viewportZoom from './vite-plugins/postcssViewportZoom.js';

export default {
  // BlackBird: viewportZoom after tailwindcss, so that it also sees its utilities (h-screen, min-h-dvh, max-h-[60vh])
  plugins: [tailwindcss(), viewportZoom(), autoprefixer()],
};
