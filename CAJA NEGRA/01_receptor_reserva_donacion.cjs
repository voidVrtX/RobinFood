const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
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

    const body = await pageText(driver);
    assert.match(body, /Confirmada/, 'La reserva debe quedar confirmada.');
    assert.match(body, /Código de entrega/, 'La reserva debe mostrar el código para recoger los alimentos.');
    assert.match(body, /[A-Z0-9]{3}-[A-Z0-9]{3}/, 'Debe generarse un código de entrega.');
    console.log('OK: el Receptor encuentra una donación y confirma una reserva.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 01_receptor_reserva_donacion:', error);
  process.exitCode = 1;
});
