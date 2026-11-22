const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const { loginAs, button, tab, input, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  const title = `Donacion caja negra ${Date.now()}`;
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');
    await loginAs(driver, 'donador');
    await tab(driver, 'Publicar');
    await (await input(driver, 'Ej. Manzanas rojas')).sendKeys(title);
    await (await button(driver, 'Publicar donación')).click();
    await waitForPageText(driver, title);
    await waitForPageText(driver, 'Donación publicada y receptores cercanos notificados.');

    assert.ok((await driver.findElement(By.tagName('body')).getText()).includes(title));
    console.log('OK: el Donador publica alimentos y ve su publicación en la aplicación.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 02_donador_publica_donacion:', error);
  process.exitCode = 1;
});
