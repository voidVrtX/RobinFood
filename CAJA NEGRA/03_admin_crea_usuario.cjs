const assert = require('node:assert/strict');
const { Builder, By } = require('selenium-webdriver');
const { loginAs, button, tab, input, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  const name = `Usuario de prueba ${Date.now()}`;
  const email = `prueba.${Date.now()}@ejemplo.mx`;
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');
    await loginAs(driver, 'admin');
    await tab(driver, 'Usuarios');
    await (await input(driver, 'Nombre')).sendKeys(name);
    await (await input(driver, 'Correo')).sendKeys(email);
    await (await button(driver, 'Receptor')).click();
    await (await button(driver, 'Crear usuario')).click();
    await waitForPageText(driver, 'Cuenta creada. Entrega la contraseña temporal de forma segura.');
    await waitForPageText(driver, 'Contraseña temporal (cópiala ahora)');

    const body = await driver.findElement(By.tagName('body')).getText();
    assert.ok(body.includes(name), 'El usuario creado debe aparecer en la lista.');
    assert.ok(body.includes(email), 'La cuenta debe mostrar el correo registrado.');
    assert.match(body, /Receptor\s+·\s+prueba\./, 'La cuenta debe tener el rol solicitado.');
    console.log('OK: Administración crea una cuenta Receptor y obtiene su contraseña temporal.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 03_admin_crea_usuario:', error);
  process.exitCode = 1;
});
