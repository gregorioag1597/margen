import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { goTo, openDemo } from './helpers';

test('receta por tanda: el alfajor rinde 48 y cuesta lo mismo por unidad', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Productos');
  await page.getByRole('link', { name: /Alfajor Premium/ }).click();
  await expect(page.getByRole('heading', { name: /Qué lleva \(tanda de 48 u\.\)/ })).toBeVisible();
  await expect(page.getByText(/Toda la tanda cuesta .*146\.400/)).toBeVisible();
  await expect(page.getByText(/4\.677,38/).first()).toBeVisible(); // mismo costo total por unidad que antes
  await expect(page.getByText('3840 g en la tanda').or(page.getByText('3.840 g en la tanda'))).toBeVisible();
  await expect(page.getByText('1 u. por unidad').first()).toBeVisible(); // caja: por unidad
});

test('merma: frutillas con 20 % → $5 por gramo usable; al cambiarla se recalcula', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Insumos');
  const card = page.getByRole('button', { name: /Frutillas/ });
  await expect(card).toContainText('$ 5');
  await expect(card).toContainText('merma 20');

  await card.click();
  await page.getByLabel('Merma (opcional)').fill('25');
  await expect(page.getByText(/Con 25\s?% de merma: .*5,33 por gramo usable/)).toBeVisible();
});

test('registrar el pago de un costo fijo desde Costos', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Costos');
  await expect(page.getByText(/Falta registrar: Contador, Software de gestión/)).toBeVisible();

  const contador = page.getByRole('listitem').filter({ hasText: 'Contador' });
  await contador.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByText(/Pago de: Contador · planificado/)).toBeVisible();
  await expect(page.getByLabel('Importe')).toHaveValue('60000');
  await page.getByRole('button', { name: 'Guardar egreso' }).click();

  await expect(contador.getByText(/Pagado .*60\.000/)).toBeVisible();
  await expect(page.getByText(/Falta registrar: Software de gestión\./)).toBeVisible();

  // Es un movimiento real: aparece en Movimientos
  await goTo(page, 'Movimientos');
  await expect(page.getByText(/^Contador · /)).toBeVisible();
});

test('una compra de chocolate más cara ofrece actualizar el insumo y muestra el impacto', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  await page.getByRole('button', { name: /^Registrar/ }).filter({ visible: true }).first().click();
  await page.getByRole('radio', { name: 'Salió plata' }).click();
  await page.getByLabel('Importe').fill('110.000');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Materia prima' });
  await page.getByLabel('¿Es la compra de un insumo? (opcional)').selectOption({ label: 'Chocolate semiamargo' });
  await page.getByLabel('Cantidad comprada').fill('5');
  await page.getByRole('button', { name: 'Guardar egreso' }).click();

  await expect(page.getByRole('heading', { name: 'Compra registrada' })).toBeVisible();
  await expect(page.getByText(/salió .*22\.000/)).toBeVisible();
  await expect(page.getByText('4 productos afectados')).toBeVisible();

  await page.getByRole('button', { name: 'Actualizar el precio de Chocolate semiamargo' }).click();
  await expect(page.getByRole('heading', { name: 'Impacto del cambio' })).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();

  await goTo(page, 'Insumos');
  await expect(page.getByRole('button', { name: /Chocolate semiamargo/ })).toContainText('$ 22');
});

test('una compra al mismo precio no pregunta nada', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  await page.getByRole('button', { name: /^Registrar/ }).filter({ visible: true }).first().click();
  await page.getByRole('radio', { name: 'Salió plata' }).click();
  await page.getByLabel('Importe').fill('36.000');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Materia prima' });
  await page.getByLabel('¿Es la compra de un insumo? (opcional)').selectOption({ label: 'Chocolate semiamargo' });
  await page.getByLabel('Cantidad comprada').fill('2');
  await page.getByRole('button', { name: 'Guardar egreso' }).click();
  await expect(page.getByRole('heading', { name: 'Compra registrada' })).toHaveCount(0);
  await expect(page.getByText('Compra de chocolate semiamargo')).toBeVisible();
});

test('exportar los movimientos del mes para el contador', async ({ page }) => {
  await openDemo(page);
  await goTo(page, 'Movimientos');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^movimientos-pasteleria-demo-\d{4}-\d{2}\.csv$/);

  const content = readFileSync((await download.path())!, 'utf8');
  expect(content.startsWith('﻿')).toBe(true);
  expect(content).toContain('Fecha;Tipo;Concepto;Categoría;Importe;Medio de pago;Proveedor;Producto;Notas');
  expect(content).toMatch(/;Egreso;Alquiler del local;Alquiler;450000,00;/);
  expect(content).toMatch(/;Ingreso;Ventas online;Venta;820000,00;Mercado Pago;;Alfajor Premium;/);
});
