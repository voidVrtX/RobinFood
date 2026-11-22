const assert = require('node:assert/strict');
const { Builder, By } = require('selenium-webdriver');
const { loginAs, logout, button, tab, input, pageText, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  const title = `Ciclo integral ${Date.now()}`;
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');

    await loginAs(driver, 'donador');
    await tab(driver, 'Publicar');
    await (await input(driver, 'Ej. Manzanas rojas')).sendKeys(title);
    await (await button(driver, 'Publicar donación')).click();
    await waitForPageText(driver, title);
    await logout(driver, 'donador');

    await loginAs(driver, 'receptor');
    await tab(driver, 'Explorar');
    await (await input(driver, 'Buscar alimentos o ubicación')).sendKeys(title);
    await (await button(driver, 'Ver y reservar')).click();
    await waitForPageText(driver, 'Mis reservas');
    const receiverState = await pageText(driver);
    const code = receiverState.match(/¡Reserva confirmada! Código ([A-Z0-9]{3}-[A-Z0-9]{3})\./);
    assert.ok(code, 'La reserva debe persistir un código entregable.');
    assert.match(receiverState, /Confirmada/, 'La reserva debe quedar activa antes de la entrega.');
    await logout(driver, 'receptor');

    await loginAs(driver, 'donador');
    await tab(driver, 'Mis entregas');
    await driver.findElement(By.xpath(`//*[normalize-space(.)="${title}"]`)).click();
    await (await input(driver, 'K7M-4PX')).sendKeys(code[1]);
    await (await button(driver, 'Confirmar entrega')).click();
    await waitForPageText(driver, '¡Entrega realizada! Gracias por ser parte de Robin Food.');
    await logout(driver, 'donador');

    await loginAs(driver, 'admin');
    await tab(driver, 'Publicaciones');
    const adminState = await pageText(driver);
    assert.ok(adminState.includes(title), 'Administración debe consultar la publicación del flujo.');
    assert.match(adminState, /entregada/i, 'El estado persistido debe reflejar la entrega completada.');
    console.log('OK: las transiciones disponible → reservada → entregada son visibles para los roles correspondientes.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 04_ciclo_integral_y_estados:', error);
  process.exitCode = 1;
});
