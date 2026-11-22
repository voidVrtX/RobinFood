import * as Crypto from 'expo-crypto';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword as updateAuthPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { TERMS_VERSION } from '@/theme/palette';
import { estimatedKg } from '@/utils/geo';
import type {
  AccessRequest, AppNotification, AuditEntry, ChatMessage, Database, Donation,
  Preferences, PublicUser, ReportAggregate, Reservation, Role, User, MapLocation,
} from '@/types/models';
import { getFirebaseClient } from './firebaseClient';
import { normalizeGoogleDriveImageUrl } from '@/utils/googleDrive';

type AccountInput = { role: Exclude<Role, 'admin'>; name: string; email: string; phone?: string };
type NewDonationInput = Omit<Donation, 'id' | 'donorId' | 'status' | 'createdAt' | 'updatedAt' | 'reservedBy' | 'reservationId'>;
type CallableData = Record<string, unknown>;

const emptyDatabase = (): Database => ({
  users: [], donations: [], reservations: [], notifications: [], messages: [],
  accessRequests: [], auditLog: [], reports: [],
});

const defaultPreferences: Preferences = {
  notifications: true, pushNotifications: false, location: false, camera: false,
  darkMode: 'system', language: 'es',
};

function currentUser(): FirebaseUser {
  const user = getFirebaseClient().auth.currentUser;
  if (!user) throw new Error('Inicia sesión para continuar.');
  return user;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapDocument<T>(id: string, data: DocumentData): T {
  return { id, ...data } as T;
}

async function call<T>(name: string, data: CallableData = {}): Promise<T> {
  const callable = httpsCallable<CallableData, T>(getFirebaseClient().functions, name);
  return (await callable(data)).data;
}

async function getProfile(uid: string): Promise<PublicUser> {
  const { db } = getFirebaseClient();
  const profile = await getDoc(doc(db, 'users', uid));
  if (!profile.exists()) throw new Error('La cuenta no tiene acceso aprobado. Solicita acceso a Robin Food.');
  const data = profile.data();
  if (data.status !== 'activo' || !['admin', 'donador', 'receptor'].includes(data.role)) {
    throw new Error('Esta cuenta no tiene acceso activo. Contacta a soporte.');
  }
  const token = await currentUser().getIdTokenResult();
  if (token.claims.role !== data.role) throw new Error('El perfil no tiene un rol autorizado. Contacta a soporte.');
  return {
    id: profile.id,
    role: data.role as Role,
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    mustChangePassword: data.mustChangePassword === true,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    businessName: typeof data.businessName === 'string' ? data.businessName : undefined,
    organization: typeof data.organization === 'string' ? data.organization : undefined,
    address: typeof data.address === 'string' ? data.address : undefined,
    lat: typeof data.lat === 'number' ? data.lat : undefined,
    lng: typeof data.lng === 'number' ? data.lng : undefined,
    status: data.status,
    failedAttempts: 0,
    acceptedTermsVersion: typeof data.acceptedTermsVersion === 'string' ? data.acceptedTermsVersion : undefined,
    acceptedTermsAt: typeof data.acceptedTermsAt === 'string' ? data.acceptedTermsAt : undefined,
    prefs: { ...defaultPreferences, ...(isRecord(data.prefs) ? data.prefs : {}) } as Preferences,
    createdBy: String(data.createdBy ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    lastLoginAt: typeof data.lastLoginAt === 'string' ? data.lastLoginAt : undefined,
  };
}

async function readCollection<T>(
  name: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const { db } = getFirebaseClient();
  const source = constraints.length ? query(collection(db, name), ...constraints) : collection(db, name);
  const result = await getDocs(source);
  return result.docs.map((entry) => mapDocument<T>(entry.id, entry.data()));
}

export async function getMapLocations(): Promise<MapLocation[]> {
  return readCollection<MapLocation>('locations', where('active', '==', true));
}

export async function upsertMapLocation(input: Omit<MapLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<MapLocation> {
  const result = await call<{ location: MapLocation }>('upsertLocation', { location: input });
  return result.location;
}

async function readOwnReservations(uid: string): Promise<Reservation[]> {
  const [asRecipient, asDonor] = await Promise.all([
    readCollection<Reservation>('reservations', where('receptorId', '==', uid)),
    readCollection<Reservation>('reservations', where('donorId', '==', uid)),
  ]);
  return [...new Map([...asRecipient, ...asDonor].map((item) => [item.id, item])).values()];
}

export async function initialize(): Promise<void> {
  getFirebaseClient();
}

export async function signIn(email: string, password: string): Promise<{ user: PublicUser; requiresTerms: boolean; mustChangePassword: boolean }> {
  const { auth } = getFirebaseClient();
  const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  try {
    const user = await getProfile(result.user.uid);
    return {
      user,
      requiresTerms: user.acceptedTermsVersion !== TERMS_VERSION,
      mustChangePassword: user.mustChangePassword,
    };
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(getFirebaseClient().auth);
}

export async function loadSignedInProfile(): Promise<PublicUser | null> {
  const user = getFirebaseClient().auth.currentUser;
  return user ? getProfile(user.uid) : null;
}

export function observeAuth(
  onUser: (user: FirebaseUser | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(getFirebaseClient().auth, onUser, onError);
}

export async function acceptTerms(): Promise<void> {
  const user = currentUser();
  await updateDoc(doc(getFirebaseClient().db, 'users', user.uid), {
    acceptedTermsVersion: TERMS_VERSION,
    acceptedTermsAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updatePassword(password: string): Promise<void> {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Usa al menos 8 caracteres, una mayúscula, un número y un símbolo.');
  }
  const user = currentUser();
  await updateAuthPassword(user, password);
  await updateDoc(doc(getFirebaseClient().db, 'users', user.uid), {
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseClient().auth, email.trim().toLowerCase());
  } catch (error) {
    if (isRecord(error) && ['auth/user-not-found', 'auth/invalid-email'].includes(String(error.code))) return;
    throw error;
  }
}

export async function requestAccess(input: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>): Promise<void> {
  await setDoc(doc(collection(getFirebaseClient().db, 'accessRequests'), Crypto.randomUUID()), {
    type: input.type,
    name: input.name,
    email: input.email,
    ...(input.desiredRole ? { desiredRole: input.desiredRole } : {}),
    message: input.message ?? '',
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  });
}

export async function createUser(input: AccountInput): Promise<{ user: PublicUser; temporaryPassword: string }> {
  return call('createAccount', input as unknown as CallableData);
}

export async function acceptAccessRequestAsAdmin(requestId: string, approve: boolean, note: string): Promise<void> {
  await call<void>('reviewAccessRequest', { requestId, approve, note });
}

export async function updateProfile(name: string, phone?: string): Promise<PublicUser> {
  await updateDoc(doc(getFirebaseClient().db, 'users', currentUser().uid), {
    name: name.trim(),
    ...(phone !== undefined ? { phone: phone.trim() } : {}),
    updatedAt: new Date().toISOString(),
  });
  return getProfile(currentUser().uid);
}

export async function updatePreferences(prefs: Partial<Preferences>): Promise<PublicUser> {
  const profile = await getProfile(currentUser().uid);
  await updateDoc(doc(getFirebaseClient().db, 'users', currentUser().uid), {
    prefs: { ...profile.prefs, ...prefs },
    updatedAt: new Date().toISOString(),
  });
  return getProfile(currentUser().uid);
}

export async function updateLocation(latitude: number, longitude: number): Promise<PublicUser> {
  await updateDoc(doc(getFirebaseClient().db, 'users', currentUser().uid), {
    lat: latitude,
    lng: longitude,
    prefs: { ...(await getProfile(currentUser().uid)).prefs, location: true },
    updatedAt: new Date().toISOString(),
  });
  return getProfile(currentUser().uid);
}

export async function reserveDonation(donationId: string): Promise<string> {
  const result = await call<{ reservationId: string }>('reserveDonation', { donationId });
  return result.reservationId;
}

export async function cancelReservation(reservationId: string): Promise<void> {
  await call<void>('cancelReservation', { reservationId });
}

export async function cancelDonation(donationId: string, reason: string): Promise<void> {
  await call<void>('cancelDonation', { donationId, reason });
}

async function uploadPhoto(uri: string, index: number, uid: string): Promise<string> {
  if (/^https?:\/\//i.test(uri) || !uri) {
    throw new Error('Selecciona una foto del dispositivo; las publicaciones reales no aceptan imágenes de muestra.');
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer la foto seleccionada.');
  const blob = await response.blob();
  const contentType = blob.type.toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new Error('Usa una imagen JPG, PNG o WebP.');
  }
  if (blob.size > 5 * 1024 * 1024) throw new Error('Cada foto debe pesar 5 MB o menos.');
  const path = `staging/${uid}/${Crypto.randomUUID()}-${index}`;
  await uploadBytes(ref(getFirebaseClient().storage, path), blob, { contentType });
  return path;
}

export async function publishDonation(input: NewDonationInput): Promise<Donation> {
  const user = currentUser();
  if (!input.title.trim() || input.quantity <= 0) throw new Error('Completa el nombre y la cantidad.');
  if (input.photos.length > 4) throw new Error('Puedes adjuntar hasta cuatro fotos.');
  const profile = await getProfile(user.uid);
  const now = new Date().toISOString();
  const donationRef = doc(collection(getFirebaseClient().db, 'donations'));
  const photos: string[] = [];
  for (let index = 0; index < input.photos.length; index++) {
    const driveUrl = normalizeGoogleDriveImageUrl(input.photos[index]);
    if (driveUrl) {
      photos.push(driveUrl);
    } else if (/^https?:\/\//i.test(input.photos[index])) {
      throw new Error('Usa un enlace público de Google Drive o selecciona una foto del dispositivo.');
    } else {
      photos.push(await uploadPhoto(input.photos[index], index, user.uid));
    }
  }
  const donation: Donation = {
    id: donationRef.id,
    donorId: user.uid,
    donorDisplayName: profile.businessName ?? profile.name,
    title: input.title.trim(),
    description: input.description ?? '',
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    photos,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    availableUntil: input.availableUntil,
    status: 'disponible',
    createdAt: now,
    updatedAt: now,
  };
  const { id: _id, ...donationData } = donation;
  await setDoc(donationRef, donationData);
  return donation;
}

export async function validateDelivery(reservationId: string, enteredCode: string): Promise<void> {
  await call<void>('validateDelivery', { reservationId, code: enteredCode.replace(/-/g, '').trim().toUpperCase() });
}

export async function moderateDonation(donationId: string, action: 'edit' | 'remove', reason: string): Promise<void> {
  await call<void>('moderateDonation', { donationId, action, reason });
}

export async function setUserStatus(userId: string, status: User['status'], reason: string): Promise<void> {
  await call<void>('setUserStatus', { userId, status, reason });
}

export async function expireStaleRecords(): Promise<number> {
  return call<number>('expireStaleRecords');
}

export async function markNotificationsRead(): Promise<void> {
  await call<void>('markNotificationsRead');
}

export async function sendSupportMessage(text: string): Promise<void> {
  await call<void>('sendSupportMessage', { text });
}

export async function replySupportMessage(conversationId: string, text: string): Promise<void> {
  await call<void>('replySupportMessage', { conversationId, text });
}

export async function getSnapshot(): Promise<Database> {
  const authUser = currentUser();
  const user = await getProfile(authUser.uid);
  const result = emptyDatabase();
  result.users = user.role === 'admin'
    ? await readCollection<PublicUser>('users')
    : [user];
  const [available, ownedDonations, reservations, notifications, messages] = await Promise.all([
    readCollection<Donation>('donations', where('status', '==', 'disponible')),
    user.role === 'donador' ? readCollection<Donation>('donations', where('donorId', '==', authUser.uid)) : Promise.resolve([]),
    user.role === 'admin' ? readCollection<Reservation>('reservations') : readOwnReservations(authUser.uid),
    user.role === 'admin'
      ? readCollection<AppNotification>('notifications')
      : readCollection<AppNotification>('notifications', where('userId', '==', authUser.uid)),
    user.role === 'admin'
      ? readCollection<ChatMessage>('messages')
      : readCollection<ChatMessage>('messages', where('conversationId', '==', authUser.uid)),
  ]);
  result.donations = [...new Map([...available, ...ownedDonations].map((item) => [item.id, item])).values()];
  result.reservations = reservations;
  result.notifications = notifications;
  result.messages = messages;
  if (user.role === 'admin') {
    const [accessRequests, auditLog, reports] = await Promise.all([
      readCollection<AccessRequest>('accessRequests'),
      readCollection<AuditEntry>('auditLog'),
      readCollection<ReportAggregate>('reports'),
    ]);
    result.accessRequests = accessRequests;
    result.auditLog = auditLog;
    result.reports = reports;
  } else {
    result.reports = await readCollection<ReportAggregate>('reports');
  }

  const recipientReservations = user.role === 'receptor'
    ? reservations.filter((item) => item.status === 'confirmada')
    : [];
  const secrets = await Promise.all(recipientReservations.map(async (reservation) => {
    const secret = await getDoc(doc(getFirebaseClient().db, 'reservationSecrets', reservation.id));
    return secret.exists() ? [reservation.id, String(secret.data().code ?? '')] as const : null;
  }));
  const codes = new Map(secrets.filter((entry): entry is readonly [string, string] => entry !== null));
  result.reservations = reservations.map((reservation) => ({
    ...reservation,
    code: codes.get(reservation.id) ?? '',
  }));

  const reservationDonations = await Promise.all(reservations
    .map((reservation) => reservation.donationId)
    .filter((id) => !result.donations.some((donation) => donation.id === id))
    .map(async (id) => {
      const donation = await getDoc(doc(getFirebaseClient().db, 'donations', id));
      return donation.exists() ? mapDocument<Donation>(donation.id, donation.data()) : null;
    }));
  result.donations.push(...reservationDonations.filter((item): item is Donation => item !== null));
  return result;
}

export async function getImpact(): Promise<{ rescuedKg: number; meals: number; co2Kg: number; deliveries: number }> {
  const database = await getSnapshot();
  const delivered = database.reservations.filter((reservation) => reservation.status === 'entregada');
  const rescuedKg = delivered.reduce((total, reservation) => {
    const donation = database.donations.find((item) => item.id === reservation.donationId);
    return total + (donation ? estimatedKg(donation.quantity, donation.unit) : 0);
  }, 0);
  const history = database.reports.at(-1)?.rescuedKg ?? 0;
  const total = rescuedKg + history;
  return {
    rescuedKg: Math.round(total * 10) / 10,
    meals: Math.round(total * 2),
    co2Kg: Math.round(total * 2.5 * 10) / 10,
    deliveries: delivered.length + (database.reports.at(-1)?.deliveries ?? 0),
  };
}

export async function exportCsv(kind: 'users' | 'donations' | 'reservations'): Promise<string> {
  const database = await getSnapshot();
  if (kind === 'users' && database.users.some((user) => user.role !== 'admin')) {
    throw new Error('Solo administración puede exportar usuarios.');
  }
  const rows = database[kind] as unknown as Record<string, unknown>[];
  if (rows.length === 0) return '\uFEFF';
  const keys = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `\uFEFF${keys.map(quote).join(',')}\r\n${rows.map((row) => keys.map((key) => quote(row[key])).join(',')).join('\r\n')}`;
}

export async function resolvePhoto(path: string): Promise<string> {
  if (/^https?:\/\//i.test(path)) {
    const driveUrl = normalizeGoogleDriveImageUrl(path);
    if (driveUrl) return driveUrl;
    throw new Error('La foto no es un enlace público válido de Google Drive.');
  }
  return getDownloadURL(ref(getFirebaseClient().storage, path));
}

export function subscribeToSnapshot(
  user: PublicUser,
  onChange: () => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseClient();
  const uid = user.id;
  const reportError = (error: Error) => onError(new Error(`No se pudo sincronizar Robin Food: ${error.message}`));
  const unsubscribers: Unsubscribe[] = [
    onSnapshot(doc(db, 'users', uid), onChange, reportError),
    onSnapshot(query(collection(db, 'donations'), where('status', '==', 'disponible')), onChange, reportError),
    onSnapshot(query(collection(db, 'reservations'), where('receptorId', '==', uid)), onChange, reportError),
    onSnapshot(query(collection(db, 'notifications'), where('userId', '==', uid)), onChange, reportError),
    onSnapshot(query(collection(db, 'messages'), where('conversationId', '==', uid)), onChange, reportError),
  ];
  if (user.role === 'donador') {
    unsubscribers.push(
      onSnapshot(query(collection(db, 'donations'), where('donorId', '==', uid)), onChange, reportError),
      onSnapshot(query(collection(db, 'reservations'), where('donorId', '==', uid)), onChange, reportError),
    );
  }
  if (user.role === 'admin') {
    unsubscribers.push(
      onSnapshot(collection(db, 'users'), onChange, reportError),
      onSnapshot(collection(db, 'donations'), onChange, reportError),
      onSnapshot(collection(db, 'reservations'), onChange, reportError),
      onSnapshot(collection(db, 'notifications'), onChange, reportError),
      onSnapshot(collection(db, 'messages'), onChange, reportError),
      onSnapshot(collection(db, 'accessRequests'), onChange, reportError),
      onSnapshot(collection(db, 'auditLog'), onChange, reportError),
      onSnapshot(collection(db, 'reports'), onChange, reportError),
    );
  }
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function resetDemo(): Promise<void> {
  throw new Error('La demostración local no está habilitada en este entorno.');
}

export async function overwriteSnapshot(_database: Database): Promise<void> {
  throw new Error('No se permite sobrescribir datos compartidos desde el cliente.');
}
