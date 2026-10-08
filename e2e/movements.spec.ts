import { expect, test } from '@playwright/test';
import { goTo, openDemo } from './helpers';

// Demo del mes actual: ingresos $1.846.000 · egresos $943.000 · resultado $903.000

test('Resumen separa el mes real de la estimación', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole('heading', { name: 'Tu mes real' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu estimación' })).toBeVisible();
  await expect(page.getByText(/903\.000/).first()).toBeVisible();
  await expect(page.getByText('En qué se fue la plata')).toBeVisible();
  await expect(page.getByText('Costos fijos (planificado)')).toBeVisible();
});

test('registrar un ingreso y un egreso actualiza el resultado', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  await expect(page.getByText(/903\.000/).first()).toBeVisible();

  // Ingreso
  await page.getByRole('button', { name: /^Registrar/ }).filter({ visible: true }).first().click();
  await page.getByLabel('Importe').fill('100.000');
  await page.getByLabel('Concepto').fill('Venta feria');
  await page.getByLabel('Medio de pago (opcional)').selectOption({ label: 'Efectivo' });
  await page.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(page.getByText('Venta feria')).toBeVisible();
  await expect(page.getByText(/1\.003\.000/).first()).toBeVisible();

  // Egreso
  await page.getByRole('button', { name: /^Registrar/ }).filter({ visible: true }).first().click();
  await page.getByRole('radio', { name: 'Salió plata' }).click();
  await page.getByLabel('Importe').fill('3.000');
  await page.getByLabel('Concepto').fill('Nafta reparto');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Transporte' });
  await page.getByRole('button', { name: 'Guardar egreso' }).click();
  await expect(page.getByText('Nafta reparto')).toBeVisible();
  await expect(page.getByText(/1\.000\.000/).first()).toBeVisible();

  // El Resumen refleja lo mismo
  await goTo(page, 'Resumen');
  await expect(page.getByText(/1\.000\.000/).first()).toBeVisible();
});

test('filtros por tipo y categoría', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');

  await page.getByRole('radio', { name: 'Egresos' }).click();
  await expect(page.getByText('Ventas de mostrador')).toHaveCount(0);
  await expect(page.getByText('Alquiler del local')).toBeVisible();

  await page.getByLabel('Filtrar por categoría').selectOption({ label: 'Materia prima' });
  await expect(page.getByText('Compra de chocolate')).toBeVisible();
  await expect(page.getByText('Alquiler del local')).toHaveCount(0);
  await expect(page.getByText(/276\.000/).first()).toBeVisible(); // 180.000 + 96.000

  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(page.getByText('Alquiler del local')).toBeVisible();
});

test('ingresos y egresos se distinguen y el mes anterior es otro', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  await expect(page.getByLabel('Ingreso').first()).toBeVisible();
  await expect(page.getByLabel('Egreso').first()).toBeVisible();

  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page.getByText('Ventas del mes')).toBeVisible();
  await expect(page.getByText('Ventas de mostrador')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
});

test('los costos fijos planificados no aparecen como egresos', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  // "Contador" es un costo fijo planificado; en el mes actual no se registró como pago.
  await expect(page.getByText('Contador')).toHaveCount(0);
});
