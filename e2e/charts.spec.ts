import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Demo: 6 meses con ingresos $11.526.000, egresos $7.523.000; mejor mes = el anterior al actual; un mes con pérdida.

test('Resumen muestra los gráficos mes a mes con su resumen en palabras', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole('heading', { name: 'Mes a mes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ingresos y egresos por mes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cómo vienen tus ingresos' })).toBeVisible();

  await expect(page.getByText(/En los últimos 6 meses ingresaste .*11\.526\.000 y gastaste .*7\.523\.000/)).toBeVisible();
  await expect(page.getByText(/Tu mejor mes fue .*1\.330\.000/)).toBeVisible();
  await expect(page.getByText(/gastaste más de lo que entró/)).toBeVisible();

  // Los gráficos se dibujan (SVG de Recharts) y tienen descripción accesible
  await expect(page.getByRole('img', { name: /En los últimos 6 meses/ })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
});

test('vista de tabla con los mismos datos y totales', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Tabla' }).click();
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(8); // encabezado + 6 meses + total
  await expect(table.getByRole('row', { name: /^Total/ })).toContainText('11.526.000');
  await expect(table.getByRole('row', { name: /^Total/ })).toContainText('7.523.000');
  await expect(table.getByRole('row', { name: /^Total/ })).toContainText('4.003.000');

  await page.getByRole('button', { name: 'Gráficos' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresos y egresos por mes' })).toBeVisible();
});

test('período de 12 meses: los meses sin movimientos aparecen en $0', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('radio', { name: '12 meses' }).click();
  await expect(page.getByText(/En los últimos 12 meses ingresaste .*11\.526\.000/)).toBeVisible();
  await page.getByRole('button', { name: 'Tabla' }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(14); // encabezado + 12 + total
});

test('un negocio nuevo sin movimientos no muestra gráficos vacíos', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /^Negocio: .*Cambiar de negocio/ }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Agregar negocio' }).click();
  await page.getByLabel('Nombre del negocio').fill('Negocio vacío');
  await page.getByLabel('Tipo de negocio').selectOption({ label: 'Otro' });
  await page.getByRole('button', { name: 'Crear negocio' }).click();
  await expect(page.getByText(/Todavía no hay movimientos en este período/)).toBeVisible();
});
