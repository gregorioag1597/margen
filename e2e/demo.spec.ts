import { expect, test } from '@playwright/test';
import { goTo, openDemo } from './helpers';

test('la pantalla de ingreso ofrece probar la demo', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('button', { name: 'Probar la demo sin registrarte' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
});

test('Resumen: métricas, atención y rankings', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText(/1\.205\.713/).first()).toBeVisible(); // ganancia del mes
  await expect(page.getByText(/5\.790\.000/).first()).toBeVisible(); // facturación
  await expect(page.getByText(/1\.987\.075/).first()).toBeVisible(); // punto de equilibrio
  await expect(page.getByRole('heading', { name: 'Productos que necesitan atención' })).toBeVisible();

  // Mayor margen ≠ más ganancia
  const ranking = page.locator('ol').filter({ hasText: 'Alfajor Premium' }).last();
  await expect(ranking.locator('li').first()).toContainText('Alfajor Premium');
  await page.getByRole('radio', { name: 'Mayor margen' }).click();
  await expect(ranking.locator('li').first()).toContainText('Cookie de chocolate');
});

test('objetivo de ganancia', async ({ page }) => {
  await openDemo(page);
  await page.getByLabel('Ganancia mensual objetivo').fill('3.000.000');
  await expect(page.getByText(/11\.449\.337/)).toBeVisible();
});

test('ficha de producto: desglose y precio recomendado', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Productos');
  await page.getByRole('link', { name: /Alfajor Premium/ }).click();
  await expect(page.getByRole('heading', { name: 'Alfajor Premium' })).toBeVisible();
  await expect(page.getByText(/4\.677,38/).first()).toBeVisible(); // costo total
  await expect(page.getByText('Tu parte de los costos fijos')).toBeVisible();
  await expect(page.getByRole('button', { name: /Usar .*6\.950/ })).toBeVisible();

  // Cambiar a 40 % recalcula el precio recomendado
  await page.getByRole('radio', { name: '40 %' }).or(page.getByRole('radio', { name: '40%' })).click();
  await expect(page.getByRole('button', { name: /Usar .*8\.550/ })).toBeVisible();
});

test('CASO CENTRAL: sube el chocolate → impacto → nuevo precio', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Insumos');
  await page.getByRole('button', { name: /Chocolate semiamargo/ }).click();

  const price = page.getByLabel('Precio que pagaste');
  await price.fill('22.000');
  await expect(page.getByText('4 productos afectados')).toBeVisible();
  await expect(page.getByText(/284\.000/)).toBeVisible();

  await page.getByRole('button', { name: 'Guardar y ver impacto' }).click();
  await expect(page.getByRole('heading', { name: 'Impacto del cambio' })).toBeVisible();
  await expect(page.getByText(/921\.713/)).toBeVisible(); // ganancia después

  // Los precios no cambian solos: el usuario elige
  await page.getByRole('button', { name: /Usar .*6\.550/ }).click();
  await expect(page.getByText(/Precio actualizado a .*6\.550/)).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();

  await goTo(page, 'Productos');
  await expect(page.getByRole('link', { name: /Alfajor Premium/ })).toContainText('6.550');
  await expect(page.getByRole('link', { name: /Brownie/ })).toContainText('4.500'); // no se tocó
});

test('historial de precios del insumo', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Insumos');
  await page.getByRole('button', { name: /Chocolate semiamargo/ }).click();
  await page.getByRole('tab', { name: 'Historial de precios' }).click();
  await expect(page.getByText(/16\.000/)).toBeVisible();
  await expect(page.getByText(/18\.000/).first()).toBeVisible();
});

test('simulador: subir precios 10 % y aplicar', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Simulador');
  await page.getByRole('button', { name: '¿Y si subo precios 10 %?' }).click();
  await expect(page.getByText(/499\.086/).first()).toBeVisible();

  await page.getByRole('button', { name: /^Aplicar escenario/ }).filter({ visible: true }).first().click();
  await expect(page.getByText(/Precio de Alfajor Premium/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar y aplicar 4 cambios' }).click();
  await expect(page.getByText('Escenario aplicado: 4 cambios guardados.')).toBeVisible();

  await goTo(page, 'Productos');
  await expect(page.getByRole('link', { name: /Alfajor Premium/ })).toContainText('6.600');
});

test('validación: un insumo sin nombre no se guarda', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Insumos');
  await page.getByRole('button', { name: 'Agregar insumo' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Guardar insumo' }).click();
  await expect(page.getByText('Poné un nombre.')).toBeVisible();
});

test('ninguna pantalla tiene scroll horizontal', async ({ page }) => {
  await openDemo(page);
  for (const section of ['Resumen', 'Movimientos', 'Productos', 'Insumos', 'Costos', 'Simulador'] as const) {
    await goTo(page, section);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `scroll horizontal en ${section}`).toBeLessThanOrEqual(0);
  }
});
