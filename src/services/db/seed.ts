import * as Crypto from 'expo-crypto';
import type { DemoDatabase, Donation, Role, User } from '@/types/models';
import { TOLUCA } from '@/theme/palette';
import { emptyDatabase, writeDatabase } from './localDb';

const now = new Date();
const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`;
const defaultPrefs = { notifications: true, pushNotifications: false, location: false, camera: false, darkMode: 'system' as const, language: 'es' as const };

const demoAccounts: { role: Role; name: string; email: string; password: string; status?: User['status']; businessName?: string; organization?: string }[] = [
  { role: 'admin', name: 'Admin Robin Food', email: 'admin@robinfood.mx', password: 'Admin#2026' },
  { role: 'donador', name: 'Panadería La Esperanza', email: 'donador@robinfood.mx', password: 'Donador#2026', businessName: 'Panadería La Esperanza' },
  { role: 'receptor', name: 'María González', email: 'receptor@robinfood.mx', password: 'Receptor#2026', organization: 'Comunidad Toluca' },
  { role: 'donador', name: 'voidChernobyl', email: 'void@robinfood.mx', password: 'Void#2026' },
  { role: 'donador', name: 'Ana Pérez', email: 'ana.perez@robinfood.mx', password: 'Ana#20262' },
  { role: 'receptor', name: 'Juan López', email: 'juan.lopez@robinfood.mx', password: 'Juan#20262' },
  { role: 'receptor', name: 'Comedor Comunitario San José', email: 'comedor.sanjose@robinfood.mx', password: 'Comedor#2026', organization: 'Comedor San José' },
  { role: 'donador', name: 'Fruvertodo Toluca', email: 'fruvertodo@robinfood.mx', password: 'Fruta#2026', status: 'suspendido', businessName: 'Fruvertodo Toluca' },
  { role: 'receptor', name: 'Lucía Ramírez', email: 'lucia.ramirez@robinfood.mx', password: 'Lucia#2026', organization: 'Red Vecinal Metepec' },
];

const foods: Pick<Donation, 'title' | 'description' | 'category' | 'quantity' | 'unit' | 'address' | 'lat' | 'lng'>[] = [
  { title: 'Manzanas rojas', description: 'Fruta fresca seleccionada, ideal para compartir.', category: 'frutas', quantity: 5, unit: 'kg', address: 'Av. Hidalgo 123, Centro, Toluca', lat: 19.2826, lng: -99.6557 },
  { title: 'Frutas surtidas', description: 'Fruta de temporada en buen estado.', category: 'frutas', quantity: 8, unit: 'kg', address: 'Paseo Tollocan, Metepec', lat: 19.2598, lng: -99.6072 },
  { title: 'Pan dulce del día', description: 'Piezas variadas elaboradas esta mañana.', category: 'pan', quantity: 10, unit: 'piezas', address: 'Centro, Toluca', lat: 19.2894, lng: -99.6551 },
  { title: 'Pan artesanal del día', description: 'Pan recién horneado de Panadería La Esperanza.', category: 'pan', quantity: 18, unit: 'piezas', address: 'Av. Hidalgo, Centro, Toluca', lat: 19.2821, lng: -99.6584 },
  { title: 'Verduras para guiso', description: 'Calabaza, jitomate y zanahoria.', category: 'verduras', quantity: 4, unit: 'kg', address: 'San Mateo Atenco', lat: 19.265, lng: -99.533 },
  { title: 'Comida preparada', description: 'Porciones del día, conservar refrigeradas.', category: 'otros', quantity: 12, unit: 'porciones', address: 'Metepec Centro', lat: 19.251, lng: -99.602 },
  { title: 'Naranjas de temporada', category: 'frutas', quantity: 6, unit: 'kg', address: 'Zinacantepec Centro', lat: 19.284, lng: -99.733 },
  { title: 'Bolillos frescos', category: 'pan', quantity: 20, unit: 'piezas', address: 'Colonia Universidad, Toluca', lat: 19.286, lng: -99.67 },
  { title: 'Lechuga y espinaca', category: 'verduras', quantity: 3, unit: 'kg', address: 'Metepec, Estado de México', lat: 19.247, lng: -99.59 },
  { title: 'Plátano maduro', category: 'frutas', quantity: 4, unit: 'kg', address: 'San Mateo Atenco', lat: 19.269, lng: -99.545 },
  { title: 'Galletas de avena', category: 'otros', quantity: 16, unit: 'piezas', address: 'Centro, Toluca', lat: 19.288, lng: -99.651 },
  { title: 'Jitomate saladet', category: 'verduras', quantity: 5, unit: 'kg', address: 'Metepec, Estado de México', lat: 19.24, lng: -99.615 },
  { title: 'Conchas de vainilla', category: 'pan', quantity: 14, unit: 'piezas', address: 'Av. Las Torres, Toluca', lat: 19.267, lng: -99.646 },
  { title: 'Mandarina', category: 'frutas', quantity: 7, unit: 'kg', address: 'Zinacantepec', lat: 19.29, lng: -99.725 },
  { title: 'Sopa de verduras', category: 'otros', quantity: 9, unit: 'porciones', address: 'Centro, Toluca', lat: 19.28, lng: -99.647 },
];

export async function createSeed(): Promise<DemoDatabase> {
  const database = emptyDatabase();
  const users: User[] = [];
  for (const [index, account] of demoAccounts.entries()) {
    const salt = Crypto.randomUUID();
    const passwordHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${account.password}`);
    users.push({
      id: id('user', index + 1), role: account.role, name: account.name, email: account.email,
      passwordHash, salt, mustChangePassword: false, status: account.status ?? 'activo',
      failedAttempts: 0, acceptedTermsVersion: undefined, prefs: defaultPrefs,
      createdBy: 'seed', createdAt: iso(-90), updatedAt: iso(-1),
      ...(account.businessName ? { businessName: account.businessName } : {}),
      ...(account.organization ? { organization: account.organization } : {}),
      ...(account.role !== 'admin' ? { address: TOLUCA.address, lat: TOLUCA.lat, lng: TOLUCA.lng } : {}),
    });
  }
  database.users = users;

  const donorIds = [users[1].id, users[3].id, users[4].id, users[7].id];
  database.donations = foods.map((food, index) => {
    const reserved = index === 1;
    return {
      ...food, id: id('donation', index + 1), donorId: donorIds[index % donorIds.length],
      photos: [`https://images.unsplash.com/photo-${['1568702846914-96b305d2aaeb', '1490474418585-ba9bad8fd0ea', '1509440159596-0249088772ff', '1549931319-a545dcf3bc73'][index % 4]}?auto=format&fit=crop&w=960&q=80`],
      availableUntil: iso(index % 3 === 0 ? 2 : 1), status: reserved ? 'reservada' : 'disponible',
      ...(reserved ? { reservedBy: users[2].id, reservationId: 'reservation-001' } : {}),
      createdAt: iso(-index), updatedAt: iso(-index),
    };
  });

  const reservationStatuses = ['confirmada', 'entregada', 'entregada', 'cancelada', 'entregada', 'expirada', 'entregada', 'cancelada'] as const;
  database.reservations = reservationStatuses.map((status, index) => {
    const createdAt = iso(-30 * index);
    const donationIndex = index === 0 ? 1 : (index + 2) % foods.length;
    if (index > 0) database.donations[donationIndex].status = status === 'entregada' ? 'entregada' : status === 'cancelada' ? 'disponible' : status === 'expirada' ? 'expirada' : 'reservada';
    return {
      id: id('reservation', index + 1), donationId: id('donation', donationIndex + 1),
      receptorId: users[index % 3 === 0 ? 2 : index % 3 === 1 ? 5 : 6].id,
      donorId: database.donations[donationIndex].donorId,
      code: ['K7M4PX', 'R5D8TW', 'H3J9NB', 'W6C2YZ', 'P8F4KM', 'T7V3RA', 'B5N8DX', 'M4Q9HJ'][index],
      status, incorrectAttempts: 0, confirmedAt: createdAt, createdAt, updatedAt: createdAt,
      ...(status === 'entregada' ? { deliveredAt: createdAt } : {}),
      ...(status === 'cancelada' ? { cancelledAt: createdAt, cancelReason: 'Cambio de planes' } : {}),
    };
  });
  database.donations[1].status = 'reservada';
  database.donations[1].reservedBy = users[2].id;
  database.donations[1].reservationId = 'reservation-001';

  database.notifications = [
    { id: 'notice-1', userId: users[2].id, type: 'sistema', title: '¡Bienvenida a Robin Food!', body: 'Explora alimentos disponibles cerca de ti.', read: false, createdAt: iso(-1) },
    { id: 'notice-2', userId: users[1].id, type: 'reserva_confirmada', title: 'Nueva reserva', body: 'Una persona reservó alimentos para recoger.', entityId: 'reservation-001', read: false, createdAt: iso(-2) },
    { id: 'notice-3', userId: users[2].id, type: 'nueva_donacion_cerca', title: 'Nueva donación cerca de ti', body: 'Hay alimentos disponibles en el Centro de Toluca.', read: true, createdAt: iso(-4) },
  ];
  database.messages = [
    { id: 'msg-1', conversationId: users[2].id, fromUserId: users[2].id, toUserId: users[0].id, text: 'Hola, ¿aún tienen las frutas?', createdAt: iso(-1), read: true },
    { id: 'msg-2', conversationId: users[2].id, fromUserId: users[0].id, toUserId: users[2].id, text: '¡Sí! Claro. Podemos ayudarte desde aquí.', createdAt: iso(-1), read: true },
  ];
  database.reports = [{ id: 'historical', users: 1248, donations: 842, reservations: 789, deliveries: 760, rescuedKg: 3820, updatedAt: iso(0) }];
  database.auditLog = [{ id: 'audit-seed', actorId: users[0].id, action: 'seed', entity: 'database', entityId: 'initial', detail: 'Datos de demostración', createdAt: iso(-1) }];
  return database;
}

export async function seedDatabase(): Promise<void> {
  await writeDatabase(await createSeed());
}
