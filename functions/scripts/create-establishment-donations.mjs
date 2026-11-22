import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'robinfood-fireb' });
const auth = getAuth();
const db = getFirestore();
const now = new Date();

const establishments = [
  { email: 'donador@robinfood.mx', name: 'Pastelerías Esperanza (Hidalgo)', locationId: 'esperanza-hidalgo', title: 'Pan dulce surtido', description: 'Pan dulce del día en buen estado para compartir.', category: 'pan', quantity: 18, unit: 'piezas', address: 'Av. Miguel Hidalgo 1301, Reforma y FFCC Nacionales, 50070 Toluca', lat: 19.2901554, lng: -99.6382314 },
  { email: 'void@robinfood.mx', name: 'Pastelerías Esperanza (Rayón)', locationId: 'esperanza-rayon', title: 'Conchas y bollos', description: 'Piezas de panadería seleccionadas el mismo día.', category: 'pan', quantity: 24, unit: 'piezas', address: 'Ignacio López Rayón 5110, Barrio de Sta. Clara, 50000 Toluca', lat: 19.2903778, lng: -99.6530373 },
  { email: 'ana.perez@robinfood.mx', name: 'Fonda Degollado', locationId: 'fonda-degollado', title: 'Verduras para guiso', description: 'Verduras frescas preparadas para entrega comunitaria.', category: 'verduras', quantity: 7, unit: 'kg', address: 'Santos Degollado 107, Centro, 50000 Toluca', lat: 19.2940124, lng: -99.6542907 },
  { email: 'fruvertodo@robinfood.mx', name: 'Gran Cardenal, el Sabor de Casa', locationId: 'gran-cardenal', title: 'Frutas de temporada', description: 'Frutas seleccionadas con autorización del establecimiento.', category: 'frutas', quantity: 12, unit: 'kg', address: 'Ignacio Allende 115, Centro, 50000 Toluca', lat: 19.2887963, lng: -99.6556963 },
  { email: 'donador@robinfood.mx', name: 'Pastelerías Esperanza (Hidalgo)', locationId: 'esperanza-hidalgo', title: 'Rebanadas de pastel', description: 'Rebanadas disponibles al cierre del establecimiento.', category: 'pan', quantity: 15, unit: 'porciones', address: 'Av. Miguel Hidalgo 1301, Reforma y FFCC Nacionales, 50070 Toluca', lat: 19.2901554, lng: -99.6382314 },
  { email: 'void@robinfood.mx', name: 'Pastelerías Esperanza (Rayón)', locationId: 'esperanza-rayon', title: 'Pan de caja', description: 'Pan de caja y piezas empacadas vigentes.', category: 'pan', quantity: 20, unit: 'piezas', address: 'Ignacio López Rayón 5110, Barrio de Sta. Clara, 50000 Toluca', lat: 19.2903778, lng: -99.6530373 },
  { email: 'ana.perez@robinfood.mx', name: 'Fonda Degollado', locationId: 'fonda-degollado', title: 'Comida preparada del día', description: 'Porciones del día, manejadas con cadena refrigerada adecuada.', category: 'otros', quantity: 10, unit: 'porciones', address: 'Santos Degollado 107, Centro, 50000 Toluca', lat: 19.2940124, lng: -99.6542907 },
  { email: 'fruvertodo@robinfood.mx', name: 'Gran Cardenal, el Sabor de Casa', locationId: 'gran-cardenal', title: 'Ensalada de verduras', description: 'Verduras lavadas y listas para consumo inmediato.', category: 'verduras', quantity: 8, unit: 'porciones', address: 'Ignacio Allende 115, Centro, 50000 Toluca', lat: 19.2887963, lng: -99.6556963 },
  { email: 'donador@robinfood.mx', name: 'Pastelerías Esperanza (Hidalgo)', locationId: 'esperanza-hidalgo', title: 'Empanadas de panadería', description: 'Empanadas recién horneadas de la jornada.', category: 'pan', quantity: 16, unit: 'piezas', address: 'Av. Miguel Hidalgo 1301, Reforma y FFCC Nacionales, 50070 Toluca', lat: 19.2901554, lng: -99.6382314 },
  { email: 'void@robinfood.mx', name: 'Pastelerías Esperanza (Rayón)', locationId: 'esperanza-rayon', title: 'Galletas surtidas', description: 'Galletas empacadas y piezas surtidas disponibles.', category: 'otros', quantity: 30, unit: 'piezas', address: 'Ignacio López Rayón 5110, Barrio de Sta. Clara, 50000 Toluca', lat: 19.2903778, lng: -99.6530373 },
];

for (const [index, item] of establishments.entries()) {
  const user = await auth.getUserByEmail(item.email);
  const expires = new Date(now.getTime() + (index + 1) * 24 * 60 * 60_000).toISOString();
  await db.collection('donations').doc().set({
    donorId: user.uid,
    donorDisplayName: item.name,
    title: item.title,
    description: item.description,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    photos: [],
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    availableUntil: expires,
    status: 'disponible',
    createdAt: new Date(now.getTime() - index * 60_000).toISOString(),
    updatedAt: now.toISOString(),
  });
  console.log(`${item.name}: ${item.title}`);
}
