const assert = require('node:assert/strict');
const { Builder, By } = require('selenium-webdriver');
const { loginAs, button, tab, pageText, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');
    await loginAs(driver, 'receptor');
    await tab(driver, 'Explorar');
    await (await button(driver, 'Ver y reservar')).click();
    await waitForPageText(driver, 'Mis reservas');

    let body = await pageText(driver);
    assert.match(body, /Confirmada/, 'La reserva debe transicionar a confirmada.');
    assert.match(body, /Código de entrega\s+[A-Z0-9]{3}-[A-Z0-9]{3}/, 'Debe renderizarse un código válido de seis caracteres.');

    const cancelButtons = await driver.findElements(
      By.xpath('//*[@role="button" and normalize-space(.)="Cancelar reserva"]'),
    );
    assert.ok(cancelButtons.length > 0, 'El Receptor debe poder cancelar una reserva activa.');
    await cancelButtons[cancelButtons.length - 1].click();
    await waitForPageText(driver, 'Reserva cancelada.');
    body = await pageText(driver);
    assert.match(body, /Cancelada/, 'La reserva debe mostrar el estado cancelado después de la acción.');
    console.log('OK: el Receptor reserva, recibe un código y cancela la reserva.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 01_receptor_reserva_y_cancela:', error);
  process.exitCode = 1;
});
