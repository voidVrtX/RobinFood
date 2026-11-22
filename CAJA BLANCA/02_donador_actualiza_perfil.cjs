const assert = require('node:assert/strict');
const { Builder, By, Key } = require('selenium-webdriver');
const { loginAs, button, tab, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  const name = `Donador actualizado ${Date.now()}`;
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');
    await loginAs(driver, 'donador');
    await tab(driver, 'Perfil');

    const nameField = await driver.wait(
      async () => {
        const fields = await driver.findElements(By.css('input'));
        return fields.length ? fields[0] : null;
      },
      20000,
    );
    await nameField.sendKeys(Key.CONTROL, 'a', Key.NULL, name);
    await (await button(driver, 'Guardar perfil')).click();
    await waitForPageText(driver, 'Perfil actualizado.');

    const body = await driver.findElement(By.tagName('body')).getText();
    assert.ok(body.includes(name), 'El perfil debe mostrar el nuevo nombre guardado.');
    assert.ok(body.includes('Donador · donador@robinfood.mx'), 'La sesión debe seguir asociada al Donador.');
    console.log('OK: el Donador actualiza su perfil y ve los cambios guardados.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 02_donador_actualiza_perfil:', error);
  process.exitCode = 1;
});
