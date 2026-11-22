const { randomInt, randomUUID, createHash } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket();
const region = 'us-central1';
const roles = new Set(['admin', 'donador', 'receptor']);
const categories = new Set(['frutas', 'verduras', 'pan', 'otros']);
const units = new Set(['kg', 'piezas', 'porciones', 'litros', 'cajas']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nowIso = () => new Date().toISOString();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clean = (value) => value.trim().replace(/[<>]/g, '');
const text = (value, name, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `Revisa el campo ${name}.`);
  }
  return clean(value);
};
const audit = (uid, action, entity, entityId, detail = '') => ({
  actorId: uid, action, entity, entityId, detail, createdAt: nowIso(),
});
const notification = (userId, type, title, body, entityId = '') => ({
  userId, type, title, body, entityId, read: false, createdAt: nowIso(),
});
const newCode = () => {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
};
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

async function requireUser(request, allowedRoles) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  const uid = request.auth.uid;
  const profile = await db.collection('users').doc(uid).get();
  const role = request.auth.token.role;
  if (!profile.exists || profile.data().status !== 'activo' || profile.data().role !== role || !roles.has(role)) {
    throw new HttpsError('permission-denied', 'La cuenta no tiene acceso activo.');
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para realizar esta acción.');
  }
  return { uid, role, profile: profile.data() };
}

function assertCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new HttpsError('invalid-argument', 'La ubicación recibida no es válida.');
  }
}

function assertDonation(input) {
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'La publicación no es válida.');
  const title = text(input.title, 'nombre', 3, 60);
  const description = typeof input.description === 'string' ? clean(input.description).slice(0, 1000) : '';
  if (!categories.has(input.category) || !units.has(input.unit)) {
    throw new HttpsError('invalid-argument', 'La categoría o unidad no es válida.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 10000) {
    throw new HttpsError('invalid-argument', 'La cantidad debe ser positiva y válida.');
  }
  const address = text(input.address, 'dirección', 4, 240);
  assertCoordinates(input.lat, input.lng);
  if (input.availableUntil !== null
    && (typeof input.availableUntil !== 'string' || !Number.isFinite(Date.parse(input.availableUntil))
      || Date.parse(input.availableUntil) <= Date.now())) {
    throw new HttpsError('invalid-argument', 'La disponibilidad debe ser futura.');
  }
  return {
    title, description, category: input.category, quantity: input.quantity, unit: input.unit,
    address, lat: input.lat, lng: input.lng, availableUntil: input.availableUntil,
  };
}

exports.createAccessRequest = onCall({ region, maxInstances: 5 }, async (request) => {
  const input = request.data || {};
  const type = input.type;
  if (!['alta', 'reset_password'].includes(type)) throw new HttpsError('invalid-argument', 'Tipo de solicitud no válido.');
  const email = text(input.email, 'correo', 3, 254).toLowerCase();
  if (!emailPattern.test(email)) throw new HttpsError('invalid-argument', 'Escribe un correo válido.');
  const name = text(input.name || 'Solicitud de restablecimiento', 'nombre', 2, 120);
  const desiredRole = input.desiredRole;
  if (type === 'alta' && !['receptor', 'donador'].includes(desiredRole)) {
    throw new HttpsError('invalid-argument', 'Selecciona un rol permitido.');
  }
  const message = typeof input.message === 'string' ? clean(input.message).slice(0, 1000) : '';
  const rateId = hash(`access:${email}`);
  const rateRef = db.collection('rateLimits').doc(rateId);
  const requestRef = db.collection('accessRequests').doc();
  await db.runTransaction(async (transaction) => {
    const rate = await transaction.get(rateRef);
    const cutoff = Date.now() - 15 * 60_000;
    const attempts = (rate.data()?.attempts || []).filter((time) => Number(time) > cutoff);
    if (attempts.length >= 3) throw new HttpsError('resource-exhausted', 'Se alcanzó el límite de solicitudes. Intenta más tarde.');
    attempts.push(Date.now());
    transaction.set(rateRef, { attempts });
    transaction.create(requestRef, {
      type, name, email, ...(type === 'alta' ? { desiredRole } : {}), message,
      status: 'pendiente', createdAt: nowIso(),
    });
  });
  return { id: requestRef.id };
});

exports.upsertLocation = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const input = request.data?.location;
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'La ubicación no es válida.');
  const name = text(input.name, 'nombre', 2, 120);
  const address = text(input.address, 'dirección', 4, 240);
  const schedule = text(input.schedule || 'Horario por confirmar', 'horario', 2, 120);
  const phone = typeof input.phone === 'string' ? clean(input.phone).slice(0, 30) : '';
  if (!['recoleccion', 'receptor'].includes(input.type)) {
    throw new HttpsError('invalid-argument', 'El tipo de ubicación no es válido.');
  }
  assertCoordinates(input.latitude, input.longitude);
  const now = nowIso();
  const id = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(input.id)
    ? input.id
    : db.collection('locations').doc().id;
  const location = {
    name, address, schedule, phone, type: input.type,
    latitude: input.latitude, longitude: input.longitude,
    active: input.active !== false, createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
  };
  await db.collection('locations').doc(id).set(location, { merge: true });
  await db.collection('auditLog').add(audit(uid, 'upsert', 'location', id, name));
  return { location: { id, ...location } };
});

exports.createAccount = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const input = request.data || {};
  if (!['receptor', 'donador'].includes(input.role)) {
    throw new HttpsError('invalid-argument', 'Solo se pueden crear cuentas receptoras o donadoras.');
  }
  const name = text(input.name, 'nombre', 2, 120);
  const email = text(input.email, 'correo', 3, 254).toLowerCase();
  if (!emailPattern.test(email)) throw new HttpsError('invalid-argument', 'Escribe un correo válido.');
  const phone = typeof input.phone === 'string' ? text(input.phone, 'teléfono', 7, 30) : '';
  const temporaryPassword = `Rf${randomUUID().replaceAll('-', '').slice(0, 12)}#a7`;
  let created;
  try {
    created = await auth.createUser({ email, displayName: name, password: temporaryPassword, disabled: false });
    await auth.setCustomUserClaims(created.uid, { role: input.role });
    const createdAt = nowIso();
    await db.collection('users').doc(created.uid).create({
      role: input.role, name, email, phone, status: 'activo', mustChangePassword: true,
      prefs: { notifications: true, pushNotifications: false, location: false, camera: false, darkMode: 'system', language: 'es' },
      createdBy: uid, createdAt, updatedAt: createdAt,
    });
    await db.collection('auditLog').add(audit(uid, 'create', 'user', created.uid, `Alta ${input.role}`));
  } catch (error) {
    if (created) await auth.deleteUser(created.uid);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('already-exists', 'No se pudo crear la cuenta. Verifica si el correo ya está registrado.');
  }
  return {
    user: {
      id: created.uid, role: input.role, name, email, phone: phone || undefined,
      status: 'activo', mustChangePassword: true, failedAttempts: 0,
      prefs: { notifications: true, pushNotifications: false, location: false, camera: false, darkMode: 'system', language: 'es' },
      createdBy: uid, createdAt: nowIso(), updatedAt: nowIso(),
    },
    temporaryPassword,
  };
});

exports.reviewAccessRequest = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const requestId = text(request.data?.requestId, 'solicitud', 1, 128);
  const approve = request.data?.approve;
  if (typeof approve !== 'boolean') throw new HttpsError('invalid-argument', 'La decisión no es válida.');
  const note = typeof request.data?.note === 'string' ? clean(request.data.note).slice(0, 500) : '';
  const requestRef = db.collection('accessRequests').doc(requestId);
  await db.runTransaction(async (transaction) => {
    const accessRequest = await transaction.get(requestRef);
    if (!accessRequest.exists || accessRequest.data().status !== 'pendiente') {
      throw new HttpsError('not-found', 'La solicitud ya no está pendiente.');
    }
    transaction.update(requestRef, {
      status: approve ? 'aprobada' : 'rechazada',
      reviewedBy: uid,
      reviewedAt: nowIso(),
      reviewNote: note,
    });
    const auditRef = db.collection('auditLog').doc();
    transaction.create(auditRef, audit(uid, approve ? 'approve' : 'reject', 'accessRequest', requestId, note));
  });
});

exports.acceptTerms = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  if (request.data?.version !== '1.0') throw new HttpsError('invalid-argument', 'La versión de términos no es válida.');
  await db.collection('users').doc(uid).update({ acceptedTermsVersion: '1.0', acceptedTermsAt: nowIso(), updatedAt: nowIso() });
});

exports.completePasswordChange = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  await db.collection('users').doc(uid).update({ mustChangePassword: false, updatedAt: nowIso() });
});

exports.updateProfile = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  const name = text(request.data?.name, 'nombre', 2, 120);
  const phone = request.data?.phone === undefined ? '' : text(request.data.phone, 'teléfono', 0, 30);
  await db.collection('users').doc(uid).update({ name, phone, updatedAt: nowIso() });
});

exports.updatePreferences = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  const prefs = request.data?.prefs;
  const allowed = new Set(['notifications', 'pushNotifications', 'location', 'camera', 'darkMode', 'language']);
  if (!prefs || typeof prefs !== 'object' || Object.keys(prefs).length === 0
    || Object.keys(prefs).some((key) => !allowed.has(key))) {
    throw new HttpsError('invalid-argument', 'Las preferencias no son válidas.');
  }
  for (const key of ['notifications', 'pushNotifications', 'location', 'camera']) {
    if (key in prefs && typeof prefs[key] !== 'boolean') throw new HttpsError('invalid-argument', 'Las preferencias no son válidas.');
  }
  if ('darkMode' in prefs && !['system', 'light', 'dark'].includes(prefs.darkMode)) {
    throw new HttpsError('invalid-argument', 'El tema no es válido.');
  }
  if ('language' in prefs && !['es', 'en'].includes(prefs.language)) {
    throw new HttpsError('invalid-argument', 'El idioma no es válido.');
  }
  await db.collection('users').doc(uid).update({
    prefs: { ...prefs }, updatedAt: nowIso(),
  });
});

exports.updateLocation = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  const { latitude, longitude } = request.data || {};
  assertCoordinates(latitude, longitude);
  await db.collection('users').doc(uid).update({
    lat: latitude, lng: longitude, 'prefs.location': true, updatedAt: nowIso(),
  });
});

exports.publishDonation = onCall({ region, maxInstances: 5 }, async (request) => {
  const { uid, profile } = await requireUser(request, ['donador']);
  const donation = assertDonation(request.data?.donation);
  const paths = request.data?.photoPaths;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 4) {
    throw new HttpsError('invalid-argument', 'Adjunta de una a cuatro fotos.');
  }
  const staging = [];
  for (const path of paths) {
    if (typeof path !== 'string' || !path.startsWith(`staging/${uid}/`)) {
      throw new HttpsError('permission-denied', 'La referencia de imagen no pertenece a esta cuenta.');
    }
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (size <= 0 || size > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType)) {
      throw new HttpsError('invalid-argument', 'Cada foto debe ser JPG, PNG o WebP de hasta 5 MB.');
    }
    staging.push(file);
  }
  const donationRef = db.collection('donations').doc();
  const destinationPaths = staging.map((_, index) => `donations/${donationRef.id}/${index + 1}`);
  const createdAt = nowIso();
  const donorDisplayName = typeof profile.businessName === 'string' && profile.businessName.trim()
    ? clean(profile.businessName.trim())
    : 'Donador Robin Food';
  try {
    await Promise.all(staging.map((file, index) => file.copy(bucket.file(destinationPaths[index]))));
    const recipientQuery = db.collection('users').where('role', '==', 'receptor').where('status', '==', 'activo');
    const recipientDocs = await recipientQuery.get();
    await db.runTransaction(async (transaction) => {
      const currentProfile = await transaction.get(db.collection('users').doc(uid));
      if (!currentProfile.exists || currentProfile.data().status !== 'activo' || currentProfile.data().role !== 'donador') {
        throw new HttpsError('permission-denied', 'La cuenta no puede publicar.');
      }
      transaction.create(donationRef, {
        ...donation,
        donorId: uid,
        donorDisplayName,
        photos: destinationPaths,
        status: 'disponible',
        createdAt,
        updatedAt: createdAt,
      });
      transaction.create(db.collection('auditLog').doc(), audit(uid, 'publish', 'donation', donationRef.id));
      for (const recipient of recipientDocs.docs) {
        const data = recipient.data();
        if (data.prefs?.notifications === false) continue;
        if (Number.isFinite(data.lat) && Number.isFinite(data.lng)
          && distanceKm(data.lat, data.lng, donation.lat, donation.lng) > 5) continue;
        transaction.create(db.collection('notifications').doc(), notification(
          recipient.id, 'nueva_donacion_cerca', 'Nueva donación cerca de ti',
          `${donation.title} está disponible en Robin Food.`, donationRef.id,
        ));
      }
    });
  } catch (error) {
    await Promise.all(destinationPaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {
      console.error('No se pudo limpiar una copia de foto de una publicación fallida.');
    })));
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No se pudo publicar la donación. Intenta de nuevo.');
  }
  await Promise.all(staging.map((file) => file.delete({ ignoreNotFound: true }).catch(() => {
    console.error('No se pudo limpiar una foto temporal después de publicar.');
  })));
  return {
    id: donationRef.id,
    ...donation,
    donorId: uid,
    donorDisplayName,
    photos: destinationPaths,
    status: 'disponible',
    createdAt,
    updatedAt: createdAt,
  };
});

exports.reserveDonation = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['receptor']);
  const donationId = text(request.data?.donationId, 'donación', 1, 128);
  const donationRef = db.collection('donations').doc(donationId);
  const reservationRef = db.collection('reservations').doc();
  const secretRef = db.collection('reservationSecrets').doc(reservationRef.id);
  const code = newCode();
  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(uid);
    const [profile, donation, active] = await Promise.all([
      transaction.get(userRef),
      transaction.get(donationRef),
      transaction.get(db.collection('reservations').where('receptorId', '==', uid).where('status', '==', 'confirmada')),
    ]);
    if (!profile.exists || profile.data().status !== 'activo' || profile.data().role !== 'receptor') {
      throw new HttpsError('permission-denied', 'Solo una cuenta receptora activa puede reservar.');
    }
    if (!donation.exists || donation.data().status !== 'disponible'
      || (donation.data().availableUntil && Date.parse(donation.data().availableUntil) <= Date.now())) {
      throw new HttpsError('failed-precondition', 'Esta donación ya no está disponible.');
    }
    if (active.size >= 3) throw new HttpsError('resource-exhausted', 'Puedes tener hasta 3 reservas activas.');
    const data = donation.data();
    const createdAt = nowIso();
    transaction.create(reservationRef, {
      donationId, receptorId: uid, donorId: data.donorId,
      status: 'confirmada', incorrectAttempts: 0,
      confirmedAt: createdAt, createdAt, updatedAt: createdAt,
    });
    transaction.create(secretRef, {
      receptorId: uid, code, codeHash: hash(code), incorrectAttempts: 0, createdAt,
    });
    transaction.update(donationRef, {
      status: 'reservada', reservedBy: uid, reservationId: reservationRef.id, updatedAt: createdAt,
    });
    transaction.create(db.collection('notifications').doc(), notification(
      uid, 'reserva_confirmada', 'Reserva confirmada', 'Tu reserva está lista para recoger.', reservationRef.id,
    ));
    transaction.create(db.collection('notifications').doc(), notification(
      data.donorId, 'reserva_confirmada', 'Nueva reserva', 'Una publicación tuya fue reservada.', reservationRef.id,
    ));
    transaction.create(db.collection('auditLog').doc(), audit(uid, 'reserve', 'donation', donationId));
  });
  return { reservationId: reservationRef.id };
});

exports.cancelReservation = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['receptor']);
  const reservationRef = db.collection('reservations').doc(text(request.data?.reservationId, 'reserva', 1, 128));
  await db.runTransaction(async (transaction) => {
    const reservation = await transaction.get(reservationRef);
    if (!reservation.exists || reservation.data().receptorId !== uid || reservation.data().status !== 'confirmada') {
      throw new HttpsError('permission-denied', 'No puedes cancelar esta reserva.');
    }
    const donationRef = db.collection('donations').doc(reservation.data().donationId);
    const donation = await transaction.get(donationRef);
    if (!donation.exists) throw new HttpsError('not-found', 'La publicación ya no está disponible.');
    const data = donation.data();
    if (data.availableUntil && Date.parse(data.availableUntil) - Date.now() < 60 * 60_000) {
      throw new HttpsError('failed-precondition', 'La cancelación solo está disponible hasta una hora antes del vencimiento.');
    }
    const timestamp = nowIso();
    const status = !data.availableUntil || Date.parse(data.availableUntil) > Date.now() ? 'disponible' : 'expirada';
    transaction.update(reservationRef, { status: 'cancelada', cancelledAt: timestamp, updatedAt: timestamp });
    transaction.update(donationRef, { status, reservedBy: null, reservationId: null, updatedAt: timestamp });
    transaction.create(db.collection('notifications').doc(), notification(
      reservation.data().donorId, 'reserva_cancelada', 'Reserva cancelada', 'El receptor canceló su reserva.', reservationRef.id,
    ));
    transaction.create(db.collection('auditLog').doc(), audit(uid, 'cancel', 'reservation', reservationRef.id));
  });
});

exports.cancelDonation = onCall({ region }, async (request) => {
  const { uid, role } = await requireUser(request);
  const donationId = text(request.data?.donationId, 'donación', 1, 128);
  const reason = text(request.data?.reason, 'motivo', 3, 500);
  const donationRef = db.collection('donations').doc(donationId);
  await db.runTransaction(async (transaction) => {
    const donation = await transaction.get(donationRef);
    if (!donation.exists || (role !== 'admin' && (role !== 'donador' || donation.data().donorId !== uid))) {
      throw new HttpsError('permission-denied', 'No tienes permiso para cancelar esta publicación.');
    }
    const data = donation.data();
    if (!['disponible', 'reservada'].includes(data.status)) throw new HttpsError('failed-precondition', 'Esta publicación ya no se puede cancelar.');
    const timestamp = nowIso();
    transaction.update(donationRef, { status: 'cancelada', updatedAt: timestamp });
    if (data.reservationId) {
      const reservationRef = db.collection('reservations').doc(data.reservationId);
      const reservation = await transaction.get(reservationRef);
      if (reservation.exists && reservation.data().status === 'confirmada') {
        transaction.update(reservationRef, { status: 'cancelada', cancelledAt: timestamp, cancelReason: reason, updatedAt: timestamp });
        transaction.create(db.collection('notifications').doc(), notification(
          reservation.data().receptorId, 'reserva_cancelada', 'Donación cancelada', reason, reservationRef.id,
        ));
      }
    }
    transaction.create(db.collection('auditLog').doc(), audit(uid, 'cancel', 'donation', donationId, reason));
  });
});

exports.validateDelivery = onCall({ region }, async (request) => {
  const { uid, role } = await requireUser(request);
  const reservationRef = db.collection('reservations').doc(text(request.data?.reservationId, 'reserva', 1, 128));
  const enteredCode = text(request.data?.code, 'código', 6, 6).toUpperCase();
  const outcome = await db.runTransaction(async (transaction) => {
    const reservation = await transaction.get(reservationRef);
    if (!reservation.exists || reservation.data().status !== 'confirmada'
      || (role === 'donador' && reservation.data().donorId !== uid)
      || !['donador', 'admin'].includes(role)) {
      return { error: 'No encontramos una reserva activa para validar.', code: 'permission-denied' };
    }
    const secretRef = db.collection('reservationSecrets').doc(reservationRef.id);
    const donationRef = db.collection('donations').doc(reservation.data().donationId);
    const [secret, donation] = await Promise.all([transaction.get(secretRef), transaction.get(donationRef)]);
    if (!secret.exists || !donation.exists) return { error: 'No encontramos una reserva activa para validar.', code: 'not-found' };
    const secretData = secret.data();
    if (secretData.incorrectAttempts >= 5) return { error: 'Se alcanzó el límite de intentos para esta reserva.', code: 'resource-exhausted' };
    if (hash(enteredCode) !== secretData.codeHash) {
      transaction.update(secretRef, { incorrectAttempts: secretData.incorrectAttempts + 1 });
      return { error: `Código incorrecto. Intentos restantes: ${4 - secretData.incorrectAttempts}.`, code: 'invalid-argument' };
    }
    const timestamp = nowIso();
    transaction.update(reservationRef, { status: 'entregada', deliveredAt: timestamp, updatedAt: timestamp });
    transaction.update(donationRef, { status: 'entregada', updatedAt: timestamp });
    transaction.create(db.collection('notifications').doc(), notification(
      reservation.data().donorId, 'entrega_registrada', 'Entrega confirmada', 'La entrega quedó registrada.', reservationRef.id,
    ));
    transaction.create(db.collection('notifications').doc(), notification(
      reservation.data().receptorId, 'entrega_registrada', '¡Entrega realizada!', 'Gracias por ser parte de Robin Food.', reservationRef.id,
    ));
    transaction.create(db.collection('auditLog').doc(), audit(uid, 'deliver', 'reservation', reservationRef.id));
    return { error: null };
  });
  if (outcome.error) throw new HttpsError(outcome.code, outcome.error);
});

exports.moderateDonation = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const donationId = text(request.data?.donationId, 'donación', 1, 128);
  const action = request.data?.action;
  const reason = text(request.data?.reason, 'motivo', 3, 500);
  if (!['edit', 'remove'].includes(action)) throw new HttpsError('invalid-argument', 'La acción no es válida.');
  const donationRef = db.collection('donations').doc(donationId);
  await db.runTransaction(async (transaction) => {
    const donation = await transaction.get(donationRef);
    if (!donation.exists) throw new HttpsError('not-found', 'No encontramos la publicación.');
    const timestamp = nowIso();
    if (action === 'remove') transaction.update(donationRef, { status: 'cancelada', updatedAt: timestamp });
    else transaction.update(donationRef, { updatedAt: timestamp });
    transaction.create(db.collection('notifications').doc(), notification(
      donation.data().donorId, 'sistema', action === 'remove' ? 'Publicación retirada' : 'Publicación revisada', reason, donationId,
    ));
    transaction.create(db.collection('auditLog').doc(), audit(uid, action, 'donation', donationId, reason));
  });
});

exports.setUserStatus = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const userId = text(request.data?.userId, 'usuario', 1, 128);
  const status = request.data?.status;
  const reason = text(request.data?.reason, 'motivo', 3, 500);
  if (!['activo', 'suspendido', 'eliminado'].includes(status) || uid === userId) {
    throw new HttpsError('invalid-argument', 'No se puede cambiar el estado de esta cuenta.');
  }
  const userRef = db.collection('users').doc(userId);
  await db.runTransaction(async (transaction) => {
    const target = await transaction.get(userRef);
    if (!target.exists || target.data().role === 'admin') throw new HttpsError('permission-denied', 'No se puede cambiar este perfil.');
    transaction.update(userRef, { status, updatedAt: nowIso() });
    transaction.create(db.collection('auditLog').doc(), audit(uid, status, 'user', userId, reason));
  });
  await auth.updateUser(userId, { disabled: status !== 'activo' });
  await auth.revokeRefreshTokens(userId);
});

exports.expireStaleRecords = onCall({ region, maxInstances: 5 }, async (request) => {
  const { uid } = await requireUser(request);
  const rateRef = db.collection('rateLimits').doc(hash(`expire:${uid}`));
  const shouldRun = await db.runTransaction(async (transaction) => {
    const rate = await transaction.get(rateRef);
    if (Number(rate.data()?.lastRun || 0) > Date.now() - 50_000) return false;
    transaction.set(rateRef, { lastRun: Date.now() });
    return true;
  });
  if (!shouldRun) return 0;
  const now = nowIso();
  const expired = await db.collection('donations')
    .where('status', 'in', ['disponible', 'reservada'])
    .where('availableUntil', '<=', now)
    .limit(100)
    .get();
  let count = 0;
  for (const item of expired.docs) {
    const donationRef = item.ref;
    const changed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(donationRef);
      if (!fresh.exists || !['disponible', 'reservada'].includes(fresh.data().status)
        || !fresh.data().availableUntil || Date.parse(fresh.data().availableUntil) > Date.now()) return false;
      const data = fresh.data();
      let reservation;
      let reservationRef;
      if (data.reservationId) {
        reservationRef = db.collection('reservations').doc(data.reservationId);
        reservation = await transaction.get(reservationRef);
      }
      transaction.update(donationRef, { status: 'expirada', updatedAt: nowIso() });
      if (reservation?.exists && reservation.data().status === 'confirmada') {
        transaction.update(reservationRef, { status: 'expirada', updatedAt: nowIso() });
        transaction.create(db.collection('notifications').doc(), notification(
          reservation.data().receptorId, 'donacion_expirada', 'La reserva venció',
          'La disponibilidad de esta donación terminó.', reservationRef.id,
        ));
      }
      return true;
    });
    if (changed) count += 1;
  }
  return count;
});

exports.markNotificationsRead = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request);
  const notices = await db.collection('notifications').where('userId', '==', uid).get();
  for (let offset = 0; offset < notices.docs.length; offset += 450) {
    const batch = db.batch();
    notices.docs.slice(offset, offset + 450).forEach((item) => batch.update(item.ref, { read: true }));
    await batch.commit();
  }
});

exports.sendSupportMessage = onCall({ region }, async (request) => {
  const { uid, role, profile } = await requireUser(request);
  const message = text(request.data?.text, 'mensaje', 1, 2000);
  const createdAt = nowIso();
  await db.collection('messages').add({
    conversationId: uid, fromUserId: uid, text: message, createdAt, read: false,
  });
  if (role !== 'admin') {
    const admins = await db.collection('users').where('role', '==', 'admin').where('status', '==', 'activo').get();
    const batch = db.batch();
    admins.docs.forEach((admin) => batch.set(db.collection('notifications').doc(), notification(
      admin.id, 'mensaje', 'Nuevo mensaje de soporte', `${profile.name}: ${message.slice(0, 80)}`,
    )));
    await batch.commit();
  }
});

exports.replySupportMessage = onCall({ region }, async (request) => {
  const { uid } = await requireUser(request, ['admin']);
  const conversationId = text(request.data?.conversationId, 'conversación', 1, 128);
  const message = text(request.data?.text, 'mensaje', 1, 2000);
  const recipient = await db.collection('users').doc(conversationId).get();
  if (!recipient.exists || recipient.data().role === 'admin') throw new HttpsError('not-found', 'No encontramos la conversación.');
  const createdAt = nowIso();
  const batch = db.batch();
  batch.set(db.collection('messages').doc(), {
    conversationId, fromUserId: uid, toUserId: conversationId, text: message, createdAt, read: false,
  });
  batch.set(db.collection('notifications').doc(), notification(
    conversationId, 'mensaje', 'Respuesta de soporte', message.slice(0, 100),
  ));
  await batch.commit();
});
