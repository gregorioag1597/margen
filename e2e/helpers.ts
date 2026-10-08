import { expect, type Page } from '@playwright/test';

export type Section = 'Resumen' | 'Movimientos' | 'Productos' | 'Insumos' | 'Costos' | 'Simulador';

const PATHS: Record<Section, string> = {
  Resumen: '/', Movimientos: '/movimientos', Productos: '/productos', Insumos: '/insumos', Costos: '/costos', Simulador: '/simulador',
};
const HEADINGS: Record<Section, string> = {
  Resumen: 'Resumen', Movimientos: 'Movimientos', Productos: 'Mis productos', Insumos: 'Mis insumos', Costos: 'Costos', Simulador: 'Simulador',
};

/** Entra a la demo pública (datos en memoria, se reinician en cada test). */
export async function openDemo(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('Estás en la demo')).toBeVisible();
}

/**
 * Navega como una persona: barra lateral en computadora; en celular, barra
 * inferior o el menú "Más" para Costos y Simulador.
 */
export async function goTo(page: Page, section: Section) {
  const direct = page.getByRole('link', { name: section, exact: true }).filter({ visible: true });
  if ((await direct.count()) > 0) {
    await direct.first().click();
  } else {
    await page.getByRole('button', { name: 'Más' }).click();
    await page.getByRole('link', { name: new RegExp(`^${section}`) }).filter({ visible: true }).first().click();
  }
  // Las secciones se cargan bajo demanda: esperar a que la pantalla nueva esté.
  await page.waitForURL((url) => url.pathname === PATHS[section]);
  await expect(page.getByRole('heading', { level: 1, name: HEADINGS[section], exact: true })).toBeVisible();
}
