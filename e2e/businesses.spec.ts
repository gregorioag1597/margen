import { expect, test } from '@playwright/test';
import { goTo, openDemo } from './helpers';

/** Abre el selector de negocios (arriba en celular, en la barra lateral en computadora). */
async function openSwitcher(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Negocio: .*Cambiar de negocio/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Tus negocios' })).toBeVisible();
}

/** Va a Configuración tocando el engranaje (celular) o la barra lateral (computadora). */
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Configuración', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();
}

test('crear un segundo negocio: empieza vacío y no mezcla datos con el primero', async ({ page }) => {
  await openDemo(page);

  await openSwitcher(page);
  await page.getByRole('button', { name: 'Agregar negocio' }).click();
  await page.getByLabel('Nombre del negocio').fill('Hamburguesería Test');
  await page.getByLabel('Tipo de negocio').selectOption({ label: 'Gastronomía' });
  await page.getByRole('button', { name: 'Crear negocio' }).click();

  // Queda activo y empieza por los primeros pasos, sin productos de la pastelería
  await expect(page.getByRole('button', { name: /^Negocio: Hamburguesería Test/ }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('En tres pasos vas a saber cuánto ganás')).toBeVisible();
  await goTo(page, 'Insumos');
  await expect(page.getByText('Todavía no cargaste insumos')).toBeVisible();
  await expect(page.getByText('Chocolate semiamargo')).toHaveCount(0);

  // Volver a la pastelería: sus datos siguen ahí
  await openSwitcher(page);
  await page.getByRole('button', { name: /Pastelería Demo/ }).click();
  await goTo(page, 'Insumos');
  await expect(page.getByRole('button', { name: /Chocolate semiamargo/ })).toBeVisible();
});

test('eliminar un negocio pide escribir su nombre', async ({ page }) => {
  await openDemo(page);
  await openSwitcher(page);
  await page.getByRole('button', { name: 'Agregar negocio' }).click();
  await page.getByLabel('Nombre del negocio').fill('Kiosco Temporal');
  await page.getByLabel('Tipo de negocio').selectOption({ label: 'Comercio' });
  await page.getByRole('button', { name: 'Crear negocio' }).click();
  await expect(page.getByRole('button', { name: /^Negocio: Kiosco Temporal/ }).filter({ visible: true }).first()).toBeVisible();

  // Navegar sin recargar: en la demo, recargar la página reinicia los datos.
  await openSettings(page);
  await page.getByRole('button', { name: 'Editar Kiosco Temporal' }).click();
  await page.getByRole('button', { name: 'Eliminar este negocio' }).click();

  const confirm = page.getByRole('button', { name: 'Eliminar para siempre' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, escribí/).fill('Kiosco');
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, escribí/).fill('kiosco temporal');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // Pasa al otro negocio y el eliminado ya no está
  await expect(page.getByRole('button', { name: /^Negocio: Pastelería Demo/ }).filter({ visible: true }).first()).toBeVisible();
  await openSettings(page);
  await expect(page.getByText('Kiosco Temporal')).toHaveCount(0);
});

test('editar el nombre de un negocio desde Configuración', async ({ page }) => {
  await openDemo(page);
  await page.goto('/configuracion');
  await page.getByRole('button', { name: 'Editar Pastelería Demo' }).click();
  await page.getByLabel('Nombre del negocio').fill('Pastelería Rosa');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('button', { name: /^Negocio: Pastelería Rosa/ }).filter({ visible: true }).first()).toBeVisible();
});
