import type { AccessRequest, Database, DemoDatabase, Donation, Preferences, PublicUser, Role, User } from '@/types/models';
import * as demo from './demoFoodService';
import * as firebase from './firebase/backend';
import { isDemoMode } from './firebase/mode';
import { initializeDatabase, resetDatabase } from './db';
import { readDatabase, writeDatabase } from './db/localDb';

export {
  credentialsSchema,
  donationSchema,
  passwordSchema,
  type LoginResult,
} from './demoFoodService';

export async function initialize(): Promise<void> {
  if (isDemoMode) await demo.initialize();
  else await firebase.initialize();
}

export async function signIn(email: string, password: string): Promise<demo.LoginResult> {
  return isDemoMode ? demo.signIn(email, password) : firebase.signIn(email, password);
}

export async function logout(): Promise<void> {
  if (isDemoMode) return;
  await firebase.signOutCurrentUser();
}

export async function loadSignedInProfile(): Promise<PublicUser | null> {
  return isDemoMode ? null : firebase.loadSignedInProfile();
}

export const observeAuth = firebase.observeAuth;
export const subscribeToSnapshot = firebase.subscribeToSnapshot;
export const resolvePhoto = (path: string): Promise<string> => firebase.resolvePhoto(path);
export const requestPasswordReset = (email: string): Promise<void> =>
  isDemoMode ? Promise.reject(new Error('La recuperación por correo solo está disponible con Firebase.')) : firebase.requestPasswordReset(email);

export async function acceptTerms(actorId: string): Promise<void> {
  if (isDemoMode) await demo.acceptTerms(actorId);
  else await firebase.acceptTerms();
}

export async function updatePassword(actorId: string, password: string): Promise<void> {
  if (isDemoMode) await demo.updatePassword(actorId, password);
  else await firebase.updatePassword(password);
}

export async function reserveDonation(actorId: string, donationId: string): Promise<string> {
  return isDemoMode ? demo.reserveDonation(actorId, donationId) : firebase.reserveDonation(donationId);
}

export async function cancelReservation(actorId: string, reservationId: string): Promise<void> {
  if (isDemoMode) await demo.cancelReservation(actorId, reservationId);
  else await firebase.cancelReservation(reservationId);
}

export async function cancelDonation(actorId: string, donationId: string, reason: string): Promise<void> {
  if (isDemoMode) await demo.cancelDonation(actorId, donationId, reason);
  else await firebase.cancelDonation(donationId, reason);
}

export async function validateDelivery(actorId: string, reservationId: string, code: string): Promise<void> {
  if (isDemoMode) await demo.validateDelivery(actorId, reservationId, code);
  else await firebase.validateDelivery(reservationId, code);
}

export async function publishDonation(
  actorId: string,
  input: Omit<Donation, 'id' | 'donorId' | 'status' | 'createdAt' | 'updatedAt' | 'reservedBy' | 'reservationId'>,
): Promise<Donation> {
  return isDemoMode ? demo.publishDonation(actorId, input) : firebase.publishDonation(input);
}

export async function requestAccess(input: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>): Promise<void> {
  if (isDemoMode) await demo.requestAccess(input);
  else await firebase.requestAccess(input);
}

export async function createUser(
  actorId: string,
  input: { role: Role; name: string; email: string; phone?: string },
): Promise<{ user: PublicUser; temporaryPassword: string }> {
  if (isDemoMode) return demo.createUser(actorId, input);
  const { role } = input;
  if (role !== 'receptor' && role !== 'donador') {
    throw new Error('Las cuentas administradoras solo se habilitan con el procedimiento seguro de bootstrap.');
  }
  return firebase.createUser({ ...input, role });
}

export async function moderateDonation(actorId: string, donationId: string, action: 'edit' | 'remove', reason: string): Promise<void> {
  if (isDemoMode) await demo.moderateDonation(actorId, donationId, action, reason);
  else await firebase.moderateDonation(donationId, action, reason);
}

export async function setUserStatus(actorId: string, userId: string, status: User['status'], reason: string): Promise<void> {
  if (isDemoMode) await demo.setUserStatus(actorId, userId, status, reason);
  else await firebase.setUserStatus(userId, status, reason);
}

export async function expireStaleRecords(): Promise<number> {
  return isDemoMode ? demo.expireStaleRecords() : firebase.expireStaleRecords();
}

export async function updateLocation(actorId: string, latitude: number, longitude: number): Promise<PublicUser> {
  return isDemoMode ? demo.updateLocation(actorId, latitude, longitude) : firebase.updateLocation(latitude, longitude);
}

export async function getImpact(): Promise<{ rescuedKg: number; meals: number; co2Kg: number; deliveries: number }> {
  return isDemoMode ? demo.getImpact() : firebase.getImpact();
}

export async function exportCsv(kind: 'users' | 'donations' | 'reservations'): Promise<string> {
  return isDemoMode ? demo.exportCsv(kind) : firebase.exportCsv(kind);
}

export async function resetDemo(): Promise<void> {
  if (isDemoMode) await demo.resetDemo();
  else await firebase.resetDemo();
}

export async function acceptAccessRequestAsAdmin(actorId: string, requestId: string, approve: boolean, note: string): Promise<void> {
  if (isDemoMode) await demo.acceptAccessRequestAsAdmin(actorId, requestId, approve, note);
  else await firebase.acceptAccessRequestAsAdmin(requestId, approve, note);
}

export async function markNotificationsRead(actorId: string): Promise<void> {
  if (isDemoMode) await demo.markNotificationsRead(actorId);
  else await firebase.markNotificationsRead();
}

export async function sendSupportMessage(actorId: string, text: string): Promise<void> {
  if (isDemoMode) await demo.sendSupportMessage(actorId, text);
  else await firebase.sendSupportMessage(text);
}

export async function replySupportMessage(actorId: string, conversationId: string, text: string): Promise<void> {
  if (isDemoMode) await demo.replySupportMessage(actorId, conversationId, text);
  else await firebase.replySupportMessage(conversationId, text);
}

export async function updatePreferences(actorId: string, prefs: Partial<Preferences>): Promise<PublicUser> {
  return isDemoMode ? demo.updatePreferences(actorId, prefs) : firebase.updatePreferences(prefs);
}

export async function updateProfile(actorId: string, name: string, phone?: string): Promise<PublicUser> {
  return isDemoMode ? demo.updateProfile(actorId, name, phone) : firebase.updateProfile(name, phone);
}

export async function snapshot(): Promise<Database> {
  if (isDemoMode) {
    await initializeDatabase();
    return readDatabase();
  }
  return firebase.getSnapshot();
}

export async function overwriteSnapshot(database: DemoDatabase): Promise<void> {
  if (!isDemoMode) throw new Error('No se permite sobrescribir datos compartidos desde el cliente.');
  await writeDatabase(database);
}

export async function resetLocalDemoDatabase(): Promise<void> {
  if (!isDemoMode) throw new Error('La base local solo existe en el modo demostración.');
  await resetDatabase();
}
