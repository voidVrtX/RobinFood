import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { TERMS_VERSION, TOLUCA } from '@/theme/palette';
import { estimatedKg, haversineKm } from '@/utils/geo';
import type { AccessRequest, AppNotification, Donation, PublicUser, Role, User } from '@/types/models';
import { initializeDatabase, resetDatabase } from './db';
import { atomic, readDatabase, withDatabaseLock, writeDatabase } from './db/localDb';

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Crypto.randomUUID()}`;
const clean = (value: string) => value.trim().replace(/[<>]/g, '');
const publicUser = ({ passwordHash: _hash, salt: _salt, ...user }: User): PublicUser => user;
const audit = (actorId: string, action: string, entity: string, entityId: string, detail?: string) => ({
  id: newId('audit'), actorId, action, entity, entityId, detail, createdAt: nowIso(),
});
const notify = (userId: string, type: AppNotification['type'], title: string, body: string, entityId?: string): AppNotification => ({
  id: newId('notice'), userId, type, title, body, entityId, read: false, createdAt: nowIso(),
});

export const credentialsSchema = z.object({
  email: z.string().email('Escribe un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});
export const passwordSchema = z.string()
  .min(8, 'Usa al menos 8 caracteres.')
  .regex(/[A-Z]/, 'Incluye una mayúscula.')
  .regex(/[0-9]/, 'Incluye un número.')
  .regex(/[^A-Za-z0-9]/, 'Incluye un símbolo.');
export const donationSchema = z.object({
  title: z.string().trim().min(3).max(60),
  category: z.enum(['frutas', 'verduras', 'pan', 'otros']),
  quantity: z.number().positive(),
  unit: z.enum(['kg', 'piezas', 'porciones', 'litros', 'cajas']),
  photos: z.array(z.string()).min(1).max(4),
  availableUntil: z.string().refine((date) => new Date(date).getTime() > Date.now(), 'La disponibilidad debe ser futura.').nullable(),
});

export interface LoginResult {
  user: PublicUser;
  requiresTerms: boolean;
  mustChangePassword: boolean;
}

export async function initialize(): Promise<void> {
  await initializeDatabase();
  await expireStaleRecords();
}

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const parsed = credentialsSchema.safeParse({ email: email.trim().toLowerCase(), password });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Revisa tus datos.');
  return withDatabaseLock(async () => {
    const database = await readDatabase();
    const user = database.users.find((item) => item.email.toLowerCase() === parsed.data.email);
    if (!user || user.status === 'eliminado') throw new Error('Correo o contraseña incorrectos.');
    if (user.status === 'suspendido') throw new Error('Esta cuenta está suspendida. Contacta a soporte.');
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000));
      throw new Error(`Cuenta bloqueada temporalmente. Intenta de nuevo en ${minutes} min.`);
    }
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${user.salt}:${password}`);
    if (digest !== user.passwordHash) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= 5) {
        user.failedAttempts = 0;
        user.lockedUntil = new Date(Date.now() + 5 * 60_000).toISOString();
      }
      await writeDatabase(database);
      throw new Error(user.lockedUntil ? 'Demasiados intentos. Cuenta bloqueada por 5 minutos.' : 'Correo o contraseña incorrectos.');
    }
    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = nowIso();
    user.updatedAt = nowIso();
    await writeDatabase(database);
    return {
      user: publicUser(user),
      requiresTerms: user.acceptedTermsVersion !== TERMS_VERSION,
      mustChangePassword: user.mustChangePassword,
    };
  });
}

export async function acceptTerms(userId: string): Promise<void> {
  await atomic((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw new Error('La sesión ya no es válida.');
    user.acceptedTermsVersion = TERMS_VERSION;
    user.acceptedTermsAt = nowIso();
  });
}

export async function updatePassword(userId: string, password: string): Promise<void> {
  const valid = passwordSchema.safeParse(password);
  if (!valid.success) throw new Error(valid.error.issues[0]?.message ?? 'La contraseña no es segura.');
  await atomic(async (db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw new Error('La sesión ya no es válida.');
    user.salt = Crypto.randomUUID();
    user.passwordHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${user.salt}:${password}`);
    user.mustChangePassword = false;
    user.updatedAt = nowIso();
  });
}

function generateDeliveryCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const seed = Crypto.randomUUID().replaceAll('-', '').toUpperCase();
  return Array.from({ length: 6 }, (_, index) => alphabet[parseInt(seed[index], 16) % alphabet.length]).join('');
}

export async function reserveDonation(actorId: string, donationId: string): Promise<string> {
  return atomic((db) => {
    const actor = db.users.find((user) => user.id === actorId);
    if (actor?.role !== 'receptor' || actor.status !== 'activo') throw new Error('Solo una cuenta receptora activa puede reservar.');
    const donation = db.donations.find((item) => item.id === donationId);
    if (!donation || donation.status !== 'disponible' || (donation.availableUntil !== null && new Date(donation.availableUntil).getTime() <= Date.now())) {
      throw new Error('Alguien se te adelantó: esta donación ya no está disponible.');
    }
    const active = db.reservations.filter((item) => item.receptorId === actorId && item.status === 'confirmada');
    if (active.length >= 3) throw new Error('Puedes tener hasta 3 reservas activas.');
    const code = generateDeliveryCode();
    const reservationId = newId('reservation');
    const timestamp = nowIso();
    db.reservations.push({
      id: reservationId, donationId, receptorId: actorId, donorId: donation.donorId,
      code, status: 'confirmada', incorrectAttempts: 0, confirmedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
    });
    donation.status = 'reservada';
    donation.reservedBy = actorId;
    donation.reservationId = reservationId;
    donation.updatedAt = timestamp;
    db.notifications.push(notify(actorId, 'reserva_confirmada', 'Reserva confirmada', `Tu código de entrega es ${code.slice(0, 3)}-${code.slice(3)}.`, reservationId));
    db.notifications.push(notify(donation.donorId, 'reserva_confirmada', 'Nueva reserva', `${actor?.name ?? 'Una persona'} reservó ${donation.title}.`, reservationId));
    db.auditLog.push(audit(actorId, 'reserve', 'donation', donationId));
    return reservationId;
  });
}

export async function cancelReservation(actorId: string, reservationId: string): Promise<void> {
  await atomic((db) => {
    const reservation = db.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.receptorId !== actorId || reservation.status !== 'confirmada') throw new Error('No puedes cancelar esta reserva.');
    const donation = db.donations.find((item) => item.id === reservation.donationId);
    if (!donation) throw new Error('La publicación ya no está disponible.');
    if (donation.availableUntil && new Date(donation.availableUntil).getTime() - Date.now() < 60 * 60_000) throw new Error('La cancelación solo está disponible hasta una hora antes del vencimiento.');
    reservation.status = 'cancelada';
    reservation.cancelledAt = nowIso();
    reservation.updatedAt = nowIso();
    donation.status = !donation.availableUntil || new Date(donation.availableUntil).getTime() > Date.now() ? 'disponible' : 'expirada';
    donation.reservedBy = undefined;
    donation.reservationId = undefined;
    donation.updatedAt = nowIso();
    db.notifications.push(notify(reservation.donorId, 'reserva_cancelada', 'Reserva cancelada', 'El receptor canceló su reserva.', reservationId));
    db.auditLog.push(audit(actorId, 'cancel', 'reservation', reservationId));
  });
}

export async function cancelDonation(actorId: string, donationId: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new Error('Indica el motivo de la cancelación.');
  await atomic((db) => {
    const actor = db.users.find((item) => item.id === actorId);
    const donation = db.donations.find((item) => item.id === donationId);
    if (!actor || !donation || (actor.role !== 'admin' && (actor.role !== 'donador' || donation.donorId !== actorId))) {
      throw new Error('No tienes permiso para cancelar esta publicación.');
    }
    if (!['disponible', 'reservada'].includes(donation.status)) throw new Error('Esta publicación ya no se puede cancelar.');
    donation.status = 'cancelada';
    donation.updatedAt = nowIso();
    const reservation = db.reservations.find((item) => item.id === donation.reservationId && item.status === 'confirmada');
    if (reservation) {
      reservation.status = 'cancelada';
      reservation.cancelledAt = nowIso();
      reservation.cancelReason = clean(reason);
      reservation.updatedAt = nowIso();
      db.notifications.push(notify(reservation.receptorId, 'reserva_cancelada', 'Donación cancelada', reason, reservation.id));
    }
    db.auditLog.push(audit(actorId, 'cancel', 'donation', donationId, clean(reason)));
  });
}

export async function validateDelivery(actorId: string, reservationId: string, enteredCode: string): Promise<void> {
  await withDatabaseLock(async () => {
    const db = await readDatabase();
    const actor = db.users.find((item) => item.id === actorId);
    if (actor?.role !== 'donador' && actor?.role !== 'admin') throw new Error('No tienes permiso para validar entregas.');
    const reservation = db.reservations.find((item) => item.id === reservationId);
    if (!reservation || (actor.role === 'donador' && reservation.donorId !== actorId) || reservation.status !== 'confirmada') throw new Error('No encontramos una reserva activa para validar.');
    if (reservation.incorrectAttempts >= 5) throw new Error('Se alcanzó el límite de intentos para esta reserva. Contacta a soporte.');
    if (reservation.code !== enteredCode.replace(/-/g, '').trim().toUpperCase()) {
      reservation.incorrectAttempts += 1;
      await writeDatabase(db);
      throw new Error(`Código incorrecto. Intentos restantes: ${5 - reservation.incorrectAttempts}.`);
    }
    reservation.status = 'entregada';
    reservation.deliveredAt = nowIso();
    reservation.updatedAt = nowIso();
    const donation = db.donations.find((item) => item.id === reservation.donationId);
    if (donation) {
      donation.status = 'entregada';
      donation.updatedAt = nowIso();
    }
    db.notifications.push(notify(reservation.donorId, 'entrega_registrada', 'Entrega confirmada', 'La entrega quedó registrada. ¡Gracias!', reservationId));
    db.notifications.push(notify(reservation.receptorId, 'entrega_registrada', '¡Entrega realizada!', 'Gracias por ser parte de Robin Food.', reservationId));
    db.auditLog.push(audit(actorId, 'deliver', 'reservation', reservationId));
    await writeDatabase(db);
  });
}

export async function publishDonation(actorId: string, input: Omit<Donation, 'id' | 'donorId' | 'status' | 'createdAt' | 'updatedAt' | 'reservedBy' | 'reservationId'>): Promise<Donation> {
  const parsed = donationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Revisa los datos de la publicación.');
  return atomic((db) => {
    const actor = db.users.find((user) => user.id === actorId);
    if (actor?.status !== 'activo' || (actor.role !== 'donador' && actor.role !== 'admin')) throw new Error('Solo una cuenta donadora activa puede publicar.');
    const timestamp = nowIso();
    const donation: Donation = {
      ...input, title: clean(input.title), id: newId('donation'), donorId: actorId,
      status: 'disponible', createdAt: timestamp, updatedAt: timestamp,
    };
    db.donations.unshift(donation);
    db.auditLog.push(audit(actorId, 'publish', 'donation', donation.id));
    const recipients = db.users.filter((user) => user.role === 'receptor' && user.status === 'activo' && user.prefs.notifications);
    for (const recipient of recipients) {
      const distance = haversineKm(recipient.lat ?? TOLUCA.lat, recipient.lng ?? TOLUCA.lng, donation.lat, donation.lng);
      if (distance <= 5) db.notifications.push(notify(recipient.id, 'nueva_donacion_cerca', 'Nueva donación cerca de ti', `${donation.title} está a ${distance.toFixed(1)} km.`, donation.id));
    }
    return donation;
  });
}

export async function requestAccess(input: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) throw new Error('Escribe un correo válido.');
  await atomic((db) => {
    db.accessRequests.unshift({ ...input, name: clean(input.name), email, id: newId('access'), status: 'pendiente', createdAt: nowIso() });
    db.notifications.push(...db.users.filter((user) => user.role === 'admin').map((admin) => notify(admin.id, 'sistema', 'Nueva solicitud de acceso', `Solicitud recibida de ${input.name}.`)));
  });
}

export async function createUser(actorId: string, input: { role: Role; name: string; email: string; phone?: string }): Promise<{ user: PublicUser; temporaryPassword: string }> {
  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success || input.name.trim().length < 2) throw new Error('Revisa el nombre y el correo.');
  return atomic(async (db) => {
    const actor = db.users.find((user) => user.id === actorId);
    if (actor?.role !== 'admin') throw new Error('Solo administración puede crear cuentas.');
    if (db.users.some((user) => user.email.toLowerCase() === email && user.status !== 'eliminado')) throw new Error('Ya existe una cuenta con ese correo.');
    const temporaryPassword = `Rf${Crypto.randomUUID().slice(0, 4)}#26`;
    const salt = Crypto.randomUUID();
    const user: User = {
      id: newId('user'), role: input.role, name: clean(input.name), email,
      passwordHash: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${temporaryPassword}`),
      salt, mustChangePassword: true, phone: input.phone, status: 'activo', failedAttempts: 0,
      prefs: { notifications: true, pushNotifications: false, location: false, camera: false, darkMode: 'system', language: 'es' },
      createdBy: actorId, createdAt: nowIso(), updatedAt: nowIso(),
    };
    db.users.push(user);
    db.auditLog.push(audit(actorId, 'create', 'user', user.id, `Alta ${user.role}`));
    return { user: publicUser(user), temporaryPassword };
  });
}

export async function moderateDonation(actorId: string, donationId: string, action: 'edit' | 'remove', reason: string): Promise<void> {
  await atomic((db) => {
    const actor = db.users.find((user) => user.id === actorId);
    if (actor?.role !== 'admin' || reason.trim().length < 3) throw new Error('La acción administrativa requiere permiso y motivo.');
    const donation = db.donations.find((item) => item.id === donationId);
    if (!donation) throw new Error('No encontramos la publicación.');
    if (action === 'remove') donation.status = 'cancelada';
    donation.updatedAt = nowIso();
    db.notifications.push(notify(donation.donorId, 'sistema', action === 'remove' ? 'Publicación retirada' : 'Publicación moderada', reason, donationId));
    db.auditLog.push(audit(actorId, action, 'donation', donationId, reason.trim()));
  });
}

export async function setUserStatus(actorId: string, userId: string, status: User['status'], reason: string): Promise<void> {
  await atomic((db) => {
    const actor = db.users.find((user) => user.id === actorId);
    const user = db.users.find((item) => item.id === userId);
    if (actor?.role !== 'admin' || !user || actorId === userId || reason.trim().length < 3) throw new Error('La acción requiere permiso administrativo y un motivo.');
    user.status = status;
    user.updatedAt = nowIso();
    db.auditLog.push(audit(actorId, status, 'user', userId, reason.trim()));
  });
}

export async function expireStaleRecords(): Promise<number> {
  return atomic((db) => {
    let count = 0;
    const now = Date.now();
    for (const donation of db.donations) {
      if (donation.availableUntil && ['disponible', 'reservada'].includes(donation.status) && new Date(donation.availableUntil).getTime() <= now) {
        donation.status = 'expirada';
        donation.updatedAt = nowIso();
        const reservation = db.reservations.find((item) => item.id === donation.reservationId && item.status === 'confirmada');
        if (reservation) {
          reservation.status = 'expirada';
          reservation.updatedAt = nowIso();
          db.notifications.push(notify(reservation.receptorId, 'donacion_expirada', 'La reserva venció', 'La disponibilidad de esta donación terminó.', reservation.id));
        }

        count += 1;
      }
    }
    return count;
  });
}

export async function updateLocation(actorId: string, latitude: number, longitude: number): Promise<PublicUser> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('La ubicación recibida no es válida.');
  }
  return atomic((db) => {
    const user = db.users.find((item) => item.id === actorId);
    if (!user) throw new Error('No encontramos tu cuenta.');
    user.lat = latitude;
    user.lng = longitude;
    user.prefs = { ...user.prefs, location: true };
    user.updatedAt = nowIso();
    return publicUser(user);
  });
}

export async function getImpact(): Promise<{ rescuedKg: number; meals: number; co2Kg: number; deliveries: number }> {
  const db = await readDatabase();
  const delivered = db.reservations.filter((reservation) => reservation.status === 'entregada');
  const rescuedKg = delivered.reduce((total, reservation) => {
    const donation = db.donations.find((item) => item.id === reservation.donationId);
    return total + (donation ? estimatedKg(donation.quantity, donation.unit) : 0);
  }, 0);
  const history = db.reports.at(-1)?.rescuedKg ?? 0;
  return { rescuedKg: Math.round((rescuedKg + history) * 10) / 10, meals: Math.round((rescuedKg + history) * 2), co2Kg: Math.round((rescuedKg + history) * 2.5 * 10) / 10, deliveries: delivered.length + (db.reports.at(-1)?.deliveries ?? 0) };
}

export async function exportCsv(kind: 'users' | 'donations' | 'reservations'): Promise<string> {
  const db = await readDatabase();
  const rows = kind === 'users'
    ? db.users.map(({ passwordHash: _hash, salt: _salt, ...user }) => user as unknown as Record<string, unknown>)
    : db[kind] as unknown as Record<string, unknown>[];
  if (rows.length === 0) return '\uFEFF';
  const keys = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `\uFEFF${keys.map(quote).join(',')}\r\n${rows.map((row) => keys.map((key) => quote(row[key])).join(',')).join('\r\n')}`;
}

export async function resetDemo(): Promise<void> {
  await resetDatabase();
}

export async function acceptAccessRequestAsAdmin(actorId: string, requestId: string, approve: boolean, note: string): Promise<void> {
  await atomic((db) => {
    const actor = db.users.find((user) => user.id === actorId);
    const request = db.accessRequests.find((item) => item.id === requestId);
    if (actor?.role !== 'admin' || !request) throw new Error('Acción no permitida.');
    request.status = approve ? 'aprobada' : 'rechazada';
    if (note.trim()) request.message = `${request.message ?? ''}\n${note.trim()}`;
    db.auditLog.push(audit(actorId, approve ? 'approve' : 'reject', 'accessRequest', requestId));
  });
}

export async function markNotificationsRead(actorId: string): Promise<void> {
  await atomic((db) => {
    for (const notification of db.notifications) if (notification.userId === actorId) notification.read = true;
  });
}

export async function sendSupportMessage(actorId: string, text: string): Promise<void> {
  const message = clean(text);
  if (message.length < 1 || message.length > 2000) throw new Error('Escribe un mensaje de hasta 2,000 caracteres.');
  await atomic((db) => {
    const user = db.users.find((item) => item.id === actorId);
    if (!user) throw new Error('Inicia sesión para contactar a soporte.');
    db.messages.push({ id: newId('message'), conversationId: actorId, fromUserId: actorId, text: message, createdAt: nowIso(), read: false });
    if (user.role !== 'admin') {
      for (const admin of db.users.filter((item) => item.role === 'admin')) {
        db.notifications.push(notify(admin.id, 'mensaje', 'Nuevo mensaje de soporte', `${user.name}: ${message.slice(0, 80)}`));
      }
    }
  });
}

export async function replySupportMessage(actorId: string, conversationId: string, text: string): Promise<void> {
  const message = clean(text);
  if (message.length < 1 || message.length > 2000) throw new Error('Escribe un mensaje de hasta 2,000 caracteres.');
  await atomic((db) => {
    const admin = db.users.find((item) => item.id === actorId);
    const recipient = db.users.find((item) => item.id === conversationId);
    if (admin?.role !== 'admin' || !recipient) throw new Error('Solo administración puede responder en esta bandeja.');
    db.messages.push({ id: newId('message'), conversationId, fromUserId: actorId, toUserId: conversationId, text: message, createdAt: nowIso(), read: false });
    db.notifications.push(notify(recipient.id, 'mensaje', 'Respuesta de soporte', message.slice(0, 100)));
  });
}

export async function updatePreferences(actorId: string, prefs: Partial<User['prefs']>): Promise<PublicUser> {
  return atomic((db) => {
    const user = db.users.find((item) => item.id === actorId);
    if (!user) throw new Error('No encontramos tu cuenta.');
    user.prefs = { ...user.prefs, ...prefs };
    user.updatedAt = nowIso();
    return publicUser(user);
  });
}

export async function updateProfile(actorId: string, name: string, phone?: string): Promise<PublicUser> {
  if (name.trim().length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.');
  return atomic((db) => {
    const user = db.users.find((item) => item.id === actorId);
    if (!user) throw new Error('No encontramos tu cuenta.');
    user.name = clean(name);
    user.phone = phone?.trim();
    user.updatedAt = nowIso();
    return publicUser(user);
  });
}

export async function snapshot() {
  await initializeDatabase();
  return readDatabase();
}

export async function overwriteSnapshot(db: Awaited<ReturnType<typeof readDatabase>>): Promise<void> {
  await writeDatabase(db);
}
