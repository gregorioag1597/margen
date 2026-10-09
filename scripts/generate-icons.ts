/**
 * Genera los íconos de la app instalable a partir del logo (SVG) usando el
 * Chromium de Playwright. Uso: npx tsx scripts/generate-icons.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BRAND = '#0f5c4a';

/** Logo: flecha de tendencia blanca sobre verde. `padding` deja zona segura para íconos "maskable". */
function logoSvg(size: number, { padding = 0.18, rounded = true } = {}) {
  const inner = size * (1 - padding * 2);
  const offset = size * padding;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 24})" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18 9.5 11l4 4L20 6"/><path d="M15 6h5v5"/>
  </g>
</svg>`;
}

const ICONS = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-maskable-512.png', size: 512, padding: 0.26, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
];

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', logoSvg(64));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${logoSvg(icon.size, icon)}</body></html>`);
  await page.locator('svg').screenshot({ path: `public/${icon.file}`, omitBackground: true });
  console.log(`public/${icon.file}`);
}
await browser.close();
