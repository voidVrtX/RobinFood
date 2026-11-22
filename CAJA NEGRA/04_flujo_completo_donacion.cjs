const assert = require('node:assert/strict');
const { Builder, By } = require('selenium-webdriver');
const { loginAs, logout, button, tab, input, pageText, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  const title = `Flujo completo ${Date.now()}`;
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');

    await loginAs(driver, 'donador');
    await tab(driver, 'Publicar');
    await (await input(driver, 'Ej. Manzanas rojas')).sendKeys(title);
    await (await button(driver, 'Publicar donación')).click();
    await waitForPageText(driver, title);
    console.log('Donador: publicación creada.');
    await logout(driver, 'donador');

    await loginAs(driver, 'receptor');
    console.log('Receptor: sesión iniciada.');
    await tab(driver, 'Explorar');
    await (await input(driver, 'Buscar alimentos o ubicación')).sendKeys(title);
    await (await button(driver, 'Ver y reservar')).click();
    await waitForPageText(driver, 'Mis reservas');
    const reservationText = await pageText(driver);
    const code = reservationText.match(/¡Reserva confirmada! Código ([A-Z0-9]{3}-[A-Z0-9]{3})\./);
    assert.ok(code, 'El Receptor debe recibir un código de entrega.');
    console.log('Receptor: reserva confirmada.');
    await logout(driver, 'receptor');

    await loginAs(driver, 'donador');
    console.log('Donador: sesión iniciada para validar la entrega.');
    await tab(driver, 'Mis entregas');
    console.log('Donador: pantalla de entregas abierta.');
    await driver.findElement(By.xpath(`//*[normalize-space(.)="${title}"]`)).click();
    console.log('Donador: reserva seleccionada.');
    await (await input(driver, 'K7M-4PX')).sendKeys(code[1]);
    console.log('Donador: código capturado.');
    await (await button(driver, 'Confirmar entrega')).click();
    await waitForPageText(driver, '¡Entrega realizada! Gracias por ser parte de Robin Food.');
    console.log('Donador: entrega validada.');
    await logout(driver, 'donador');

    await loginAs(driver, 'admin');
    console.log('Administración: sesión iniciada.');
    await tab(driver, 'Publicaciones');
    const adminView = await pageText(driver);
    assert.ok(adminView.includes(title), 'Administración debe poder consultar la publicación entregada.');
    assert.match(adminView, /entregada/i, 'La publicación debe reflejar su estado final.');
    console.log('OK: Donador publica y valida, Receptor reserva y Administración revisa la entrega.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 04_flujo_completo_donacion:', error);
  process.exitCode = 1;
});
