const assert = require('node:assert/strict');
const { Builder, By } = require('selenium-webdriver');
const { loginAs, button, tab, waitForPageText } = require('./selenium_helpers.cjs');

async function run() {
  const driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.manage().window().setRect({ width: 1365, height: 900 });
    await driver.get(process.env.ROBINFOOD_URL || 'http://localhost:8081');
    await loginAs(driver, 'admin');
    await tab(driver, 'Reportes');

    const preview = await driver.findElement(
      By.xpath('//*[normalize-space(.)="Vista previa de exportación"]'),
    );
    assert.ok(await preview.isDisplayed(), 'El reporte debe mostrar una vista previa de datos.');
    await (await button(driver, 'Exportar CSV · users')).click();
    await waitForPageText(driver, 'Exportación de users lista.');

    const body = await driver.findElement(By.tagName('body')).getText();
    assert.match(body, /Usuarios:\s+\d+/, 'El reporte debe incluir el total de usuarios.');
    assert.match(body, /Publicaciones:\s+\d+/, 'El reporte debe incluir el total de publicaciones.');
    console.log('OK: Administración consulta el reporte y solicita la exportación CSV de usuarios.');
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error('Falló 03_admin_exporta_reporte:', error);
  process.exitCode = 1;
});
