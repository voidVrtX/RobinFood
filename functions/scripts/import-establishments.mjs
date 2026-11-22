import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'robinfood-fireb';
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();

const locations = [
  { id: 'esperanza-hidalgo', name: 'Pastelerías Esperanza (Hidalgo)', address: 'Av. Miguel Hidalgo 1301, Reforma y FFCC Nacionales, 50070 Toluca', schedule: 'Diario 7:00–21:00', type: 'recoleccion', latitude: 19.2901554, longitude: -99.6382314, active: true },
  { id: 'esperanza-rayon', name: 'Pastelerías Esperanza (Rayón)', address: 'Ignacio López Rayón 5110, Barrio de Sta. Clara, 50000 Toluca', schedule: 'Diario 7:00–21:00', type: 'recoleccion', latitude: 19.2903778, longitude: -99.6530373, active: true },
  { id: 'fonda-degollado', name: 'Fonda Degollado', address: 'Santos Degollado 107, Centro, 50000 Toluca', schedule: 'Diario 8:00–19:00', type: 'recoleccion', latitude: 19.2940124, longitude: -99.6542907, active: true },
  { id: 'gran-cardenal', name: 'Gran Cardenal, el Sabor de Casa', address: 'Ignacio Allende 115, Centro, 50000 Toluca', schedule: 'Lun–Vie 8:00–17:00, Sáb 8:00–16:00, Dom 8:00–13:00', type: 'recoleccion', latitude: 19.2887963, longitude: -99.6556963, active: true },
  { id: 'fonda-don-javier', name: 'Fonda Don Javier', address: 'República de Brasil 207, Américas Cárdenas, 50130 Toluca', schedule: 'Lun–Sáb 8:00–18:00 (Dom cerrado)', type: 'recoleccion', latitude: 19.2807987, longitude: -99.6474318, active: true },
  { id: 'casa-hogar-alegria', name: 'Casa Hogar Alegría', address: 'Lanceros de Toluca 208, Héroes del 5 de Mayo, 50170 Toluca', schedule: 'Lun–Sáb 9:00–20:00', type: 'receptor', phone: '722 208 9255', latitude: 19.262224, longitude: -99.6746534, active: true },
  { id: 'hogares-providencia', name: 'Hogares Providencia', address: 'C. Huitzilopochtli 102, Barrio de Sta. Bárbara, 50050 Toluca', schedule: 'Abierto 24 h', type: 'receptor', phone: '722 214 1616', latitude: 19.298754, longitude: -99.658205, active: true },
  { id: 'por-una-ninez-feliz', name: 'Por Una Niñez Feliz A.C.', address: 'Sta. Magdalena S/N, Ejido Altamirano, San Mateo Oxtotitlán, 50100 Toluca', schedule: 'Lun–Sáb 9:00–17:00', type: 'receptor', phone: '722 217 1482', latitude: 19.3002606, longitude: -99.702988, active: true },
];

const accounts = [
  { role: 'admin', name: 'Admin Robin Food', email: 'admin@robinfood.mx', locationId: null },
  { role: 'donador', name: 'Pastelerías Esperanza (Hidalgo)', email: 'donador@robinfood.mx', businessName: 'Pastelerías Esperanza (Hidalgo)', locationId: 'esperanza-hidalgo' },
  { role: 'receptor', name: 'Casa Hogar Alegría', email: 'receptor@robinfood.mx', organization: 'Casa Hogar Alegría', locationId: 'casa-hogar-alegria' },
  { role: 'donador', name: 'Pastelerías Esperanza (Rayón)', email: 'void@robinfood.mx', businessName: 'Pastelerías Esperanza (Rayón)', locationId: 'esperanza-rayon' },
  { role: 'donador', name: 'Fonda Degollado', email: 'ana.perez@robinfood.mx', businessName: 'Fonda Degollado', locationId: 'fonda-degollado' },
  { role: 'receptor', name: 'Hogares Providencia', email: 'juan.lopez@robinfood.mx', organization: 'Hogares Providencia', locationId: 'hogares-providencia' },
  { role: 'receptor', name: 'Por Una Niñez Feliz A.C.', email: 'comedor.sanjose@robinfood.mx', organization: 'Por Una Niñez Feliz A.C.', locationId: 'por-una-ninez-feliz' },
  { role: 'donador', name: 'Gran Cardenal, el Sabor de Casa', email: 'fruvertodo@robinfood.mx', businessName: 'Gran Cardenal, el Sabor de Casa', locationId: 'gran-cardenal' },
  { role: 'receptor', name: 'Comedor Comunitario San José', email: 'lucia.ramirez@robinfood.mx', organization: 'Comedor Comunitario San José', locationId: null },
];

for (const location of locations) {
  const { id, ...data } = location;
  await db.collection('locations').doc(id).set({ ...data, createdAt: now, updatedAt: now }, { merge: true });
}

const locationMap = new Map(locations.map((location) => [location.id, location]));
const temporaryPasswords = [];
for (const account of accounts) {
  let user;
  try {
    user = await auth.getUserByEmail(account.email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  let temporaryPassword = '';
  if (!user) {
    temporaryPassword = `Rf${randomUUID().replaceAll('-', '').slice(0, 12)}#A7`;
    user = await auth.createUser({
      email: account.email,
      displayName: account.name,
      password: temporaryPassword,
      emailVerified: false,
      disabled: false,
    });
  } else {
    await auth.updateUser(user.uid, { displayName: account.name, disabled: false });
  }

  await auth.setCustomUserClaims(user.uid, { role: account.role });
  const location = account.locationId ? locationMap.get(account.locationId) : null;
  await db.collection('users').doc(user.uid).set({
    role: account.role,
    name: account.name,
    email: account.email,
    status: 'activo',
    mustChangePassword: temporaryPassword ? true : false,
    prefs: { notifications: true, pushNotifications: false, location: Boolean(location), camera: false, darkMode: 'system', language: 'es' },
    createdBy: 'establishment-import',
    createdAt: now,
    updatedAt: now,
    ...(account.businessName ? { businessName: account.businessName } : {}),
    ...(account.organization ? { organization: account.organization } : {}),
    ...(location ? { address: location.address, lat: location.latitude, lng: location.longitude } : {}),
  }, { merge: true });

  if (temporaryPassword) temporaryPasswords.push({ name: account.name, email: account.email, password: temporaryPassword });
  console.log(`${account.name}: ${account.email} | ${temporaryPassword ? 'contraseña temporal creada y guardada fuera del repositorio' : 'cuenta existente actualizada'}`);
}

if (temporaryPasswords.length) {
  const output = temporaryPasswords
    .map(({ name, email, password }) => `${name}\t${email}\t${password}`)
    .join('\n');
  await writeFile(
    'C:/Users/HP/.copilot/session-state/c892ed42-b18d-4338-a167-141803de3275/files/firebase-temporary-passwords.txt',
    `Nombre\tCorreo\tContraseña temporal\n${output}\n`,
    'utf8',
  );
  console.log('Contraseñas temporales guardadas en la carpeta privada de esta sesión.');
}
console.log(`Importación completa: ${locations.length} ubicaciones y ${accounts.length} cuentas.`);
