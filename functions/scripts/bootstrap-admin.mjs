import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'robinfood-fireb';
const uid = process.env.BOOTSTRAP_ADMIN_UID;
if (!uid) throw new Error('Define BOOTSTRAP_ADMIN_UID con el UID de la cuenta creada en Firebase Authentication.');

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();
const account = await auth.getUser(uid);
const profileRef = db.collection('users').doc(uid);
const existingAdmins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
if (!existingAdmins.empty) throw new Error('Ya existe un perfil administrador; el bootstrap solo se ejecuta una vez.');
if ((await profileRef.get()).exists) throw new Error('El perfil ya existe; no se puede promover una cuenta existente.');

await auth.setCustomUserClaims(uid, { role: 'admin' });
await profileRef.create({
  role: 'admin',
  name: account.displayName || account.email || 'Administración Robin Food',
  email: account.email || '',
  status: 'activo',
  mustChangePassword: true,
  prefs: { notifications: true, pushNotifications: false, location: false, camera: false, darkMode: 'system', language: 'es' },
  createdBy: 'secure-bootstrap',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
await db.collection('auditLog').add({
  actorId: uid,
  action: 'bootstrap',
  entity: 'user',
  entityId: uid,
  detail: 'Initial administrator provisioned by trusted server tooling',
  createdAt: new Date().toISOString(),
});
await auth.revokeRefreshTokens(uid);
console.log(`Bootstrap completed for Firebase Auth UID ${uid}.`);
