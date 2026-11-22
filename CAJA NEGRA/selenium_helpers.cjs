const { By, until } = require('selenium-webdriver');

const timeout = 20000;
const accounts = {
  admin: { label: 'Administrador', email: 'admin@robinfood.mx', password: 'Admin#2026', displayRole: 'Administración' },
  donador: { label: 'Donador', email: 'donador@robinfood.mx', password: 'Donador#2026', displayRole: 'Donador' },
  receptor: { label: 'Receptor', email: 'receptor@robinfood.mx', password: 'Receptor#2026', displayRole: 'Receptor' },
};

async function button(driver, label) {
  const locator = By.xpath(`//*[@role="button" and normalize-space(.)="${label}"]`);
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

async function tab(driver, label) {
  const locator = By.xpath(`//*[@role="tab" and normalize-space(.)="${label}"]`);
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  await element.click();
}

async function input(driver, placeholder) {
  const locator = By.css(`input[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`);
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

async function pageText(driver) {
  return driver.findElement(By.tagName('body')).getText();
}

async function waitForPageText(driver, text) {
  await driver.wait(async () => (await pageText(driver)).includes(text), timeout);
}

async function loginAs(driver, role) {
  const account = accounts[role];
  if (!account) throw new Error(`Rol de prueba desconocido: ${role}`);

  const firstScreen = await driver.wait(async () => {
    const start = await driver.findElements(By.xpath('//*[@role="button" and normalize-space(.)="Comenzar"]'));
    if (start.length) return { start: start[0] };
    const email = await driver.findElements(By.css('input[placeholder="tu@correo.com"]'));
    return email.length ? { email: email[0] } : null;
  }, timeout);
  if (firstScreen.start) await firstScreen.start.click();
  await input(driver, 'tu@correo.com');

  const accountRow = `//*[normalize-space(.)="${account.label} · ${account.email}"]`;
  let rows = await driver.findElements(By.xpath(accountRow));
  if (!rows.length) {
    const toggle = await driver.findElements(By.xpath(
      '//*[@role="button" and (normalize-space(.)="Cuentas demo +" or normalize-space(.)="Cuentas demo −")]',
    ));
    if (toggle.length && (await toggle[0].getText()).includes('+')) await toggle[0].click();
    rows = await driver.wait(async () => {
      const found = await driver.findElements(By.xpath(accountRow));
      return found.length ? found : null;
    }, timeout);
  }

  await rows[0].click();
  await (await button(driver, 'Entrar')).click();
  const terms = await driver.wait(async () => {
    const checkbox = await driver.findElements(By.css('[role="checkbox"]'));
    const footer = await driver.findElements(By.xpath(
      `//*[normalize-space(.)="Robin Food · ${account.displayRole} · Demo local"]`,
    ));
    return checkbox.length ? { checkbox: checkbox[0] } : footer.length ? { footer: footer[0] } : null;
  }, timeout);
  if (terms.checkbox) {
    await terms.checkbox.click();
    await (await button(driver, 'Aceptar y continuar')).click();
  }
  await waitForPageText(driver, `Robin Food · ${account.displayRole} · Demo local`);
}

async function logout(driver, role) {
  if (role === 'admin') {
    const signOut = await driver.wait(
      until.elementLocated(By.xpath('//*[@role="tab" and normalize-space(.)="Cerrar sesión"]')),
      timeout,
    );
    await signOut.click();
  } else {
    await tab(driver, 'Perfil');
    await (await button(driver, 'Cerrar sesión')).click();
  }
  await input(driver, 'tu@correo.com');
}

module.exports = { accounts, button, input, loginAs, logout, pageText, tab, waitForPageText };
