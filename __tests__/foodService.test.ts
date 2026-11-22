jest.mock('@/services/firebase/mode', () => ({ isDemoMode: true }));
jest.mock('@/services/firebase/backend', () => ({}));

import { acceptTerms, cancelDonation, cancelReservation, createUser, expireStaleRecords, exportCsv, initialize, publishDonation, reserveDonation, signIn, updateLocation, validateDelivery } from '@/services/foodService';
import { readDatabase, writeDatabase } from '@/services/db/localDb';
import { resetDatabase } from '@/services/db';
import { haversineKm, estimatedKg } from '@/utils/geo';

beforeEach(async () => {
  await resetDatabase();
});

describe('autenticación local', () => {
  it('inicia sesión y retorna perfil sin hashes', async () => {
    const result = await signIn('receptor@robinfood.mx', 'Receptor#2026');
    expect(result.user.email).toBe('receptor@robinfood.mx');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('salt');
  });

  it('persiste los intentos y bloquea después de cinco contraseñas incorrectas', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(signIn('receptor@robinfood.mx', 'Incorrecta#1')).rejects.toThrow();
    }
    await expect(signIn('receptor@robinfood.mx', 'Receptor#2026')).rejects.toThrow('bloqueada');
    const user = (await readDatabase()).users.find((item) => item.email === 'receptor@robinfood.mx');
    expect(user?.lockedUntil).toBeTruthy();
  });

  it('rechaza cuentas suspendidas', async () => {
    await expect(signIn('fruvertodo@robinfood.mx', 'Fruta#2026')).rejects.toThrow('suspendida');
  });

  it('guarda la aceptación de términos por cuenta para futuros inicios de sesión', async () => {
    const firstLogin = await signIn('receptor@robinfood.mx', 'Receptor#2026');
    expect(firstLogin.requiresTerms).toBe(true);
    await acceptTerms(firstLogin.user.id);
    expect((await signIn('receptor@robinfood.mx', 'Receptor#2026')).requiresTerms).toBe(false);
  });

  it('actualiza coordenadas GPS validadas y conserva la preferencia de ubicación', async () => {
    const result = await updateLocation('user-003', 19.3, -99.6);
    expect(result.lat).toBe(19.3);
    expect(result.lng).toBe(-99.6);
    expect(result.prefs.location).toBe(true);
    await expect(updateLocation('user-003', 91, -99.6)).rejects.toThrow('ubicación');
  });
});

describe('reservas y entregas', () => {
  it('crea reserva y evita que una publicación se reserve dos veces', async () => {
    const db = await readDatabase();
    const donation = db.donations.find((item) => item.status === 'disponible');
    expect(donation).toBeTruthy();
    await reserveDonation('user-003', donation!.id);
    await expect(reserveDonation('user-006', donation!.id)).rejects.toThrow('adelantó');
  });

  it('serializa reservas simultáneas y acepta solo una reserva por donación', async () => {
    const db = await readDatabase();
    const donation = db.donations.find((item) => item.id === 'donation-001')!;
    const results = await Promise.allSettled([
      reserveDonation('user-003', donation.id),
      reserveDonation('user-006', donation.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('limita a tres reservas activas por receptor', async () => {
    const db = await readDatabase();
    const available = db.donations.filter((item) => item.status === 'disponible').slice(0, 3);
    await reserveDonation('user-003', available[0].id);
    await reserveDonation('user-003', available[1].id);
    await expect(reserveDonation('user-003', available[2].id)).rejects.toThrow('hasta 3');
  });

  it('permite cancelar reserva y restablece una donación vigente', async () => {
    const donation = (await readDatabase()).donations.find((item) => item.status === 'disponible')!;
    const reservationId = await reserveDonation('user-003', donation.id);
    await cancelReservation('user-003', reservationId);
    const db = await readDatabase();
    expect(db.reservations.find((item) => item.id === reservationId)?.status).toBe('cancelada');
    expect(db.donations.find((item) => item.id === donation.id)?.status).toBe('disponible');
  });

  it('mantiene activas las publicaciones configuradas hasta que el donador las elimine', async () => {
    const db = await readDatabase();
    const donation = db.donations.find((item) => item.status === 'disponible')!;
    donation.availableUntil = null;
    await writeDatabase(db);
    await expect(expireStaleRecords()).resolves.toBe(0);
    const reservationId = await reserveDonation('user-003', donation.id);
    expect((await readDatabase()).reservations.find((item) => item.id === reservationId)?.status).toBe('confirmada');
  });

  it('valida la entrega correcta y conserva intentos de código incorrecto', async () => {
    await expect(validateDelivery('user-004', 'reservation-001', 'AAAAAA')).rejects.toThrow('Código incorrecto');
    expect((await readDatabase()).reservations[0].incorrectAttempts).toBe(1);
    await validateDelivery('user-004', 'reservation-001', 'K7M4PX');
    expect((await readDatabase()).reservations[0].status).toBe('entregada');
  });

  it('limita el registro de códigos erróneos a cinco intentos', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(validateDelivery('user-004', 'reservation-001', 'AAAAAA')).rejects.toThrow();
    }
    await expect(validateDelivery('user-004', 'reservation-001', 'K7M4PX')).rejects.toThrow('límite');
  });
});

describe('administración, métricas y exportación', () => {
  it('permite creación de cuentas solo al administrador y genera acceso temporal', async () => {
    await expect(createUser('user-003', { role: 'donador', name: 'Tienda X', email: 'tienda@example.mx' })).rejects.toThrow('Solo administración');
    const result = await createUser('user-001', { role: 'donador', name: 'Tienda X', email: 'tienda@example.mx' });
    expect(result.temporaryPassword).toBeTruthy();
    expect(result.user.mustChangePassword).toBe(true);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('valida una publicación nueva y requiere autorización del donador', async () => {
    const input = {
      title: 'Pan del día', description: 'Recién horneado', category: 'pan' as const,
      quantity: 8, unit: 'piezas' as const, photos: ['local://foto'],
      address: 'Centro, Toluca', lat: 19.2826, lng: -99.6557,
      availableUntil: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await expect(publishDonation('user-003', input)).rejects.toThrow('donadora');
    await expect(publishDonation('user-002', { ...input, title: 'x' })).rejects.toThrow();
    const donation = await publishDonation('user-002', input);
    expect(donation.status).toBe('disponible');
    expect(donation.photos).toHaveLength(1);
  });

  it('admite una publicación que solo vence cuando el donador la elimina', async () => {
    const donation = await publishDonation('user-002', {
      title: 'Alimento sin vencimiento automático', category: 'otros', quantity: 2, unit: 'kg',
      photos: ['local://foto'], address: 'Centro, Toluca', lat: 19.2826, lng: -99.6557,
      availableUntil: null,
    });
    expect(donation.availableUntil).toBeNull();
    await expect(expireStaleRecords()).resolves.toBe(0);
    expect((await readDatabase()).donations.find((item) => item.id === donation.id)?.status).toBe('disponible');
  });

  it('cancela una publicación con motivo y audita la acción', async () => {
    const db = await readDatabase();
    const donation = db.donations.find((item) => item.status === 'disponible')!;
    await expect(cancelDonation('user-003', donation.id, 'Motivo')).rejects.toThrow('permiso');
    await cancelDonation('user-002', donation.id, 'Cierre anticipado');
    const result = await readDatabase();
    expect(result.donations.find((item) => item.id === donation.id)?.status).toBe('cancelada');
    expect(result.auditLog.at(-1)?.detail).toBe('Cierre anticipado');
  });

  it('expira publicaciones y reservas cuya vigencia terminó', async () => {
    const db = await readDatabase();
    const donation = db.donations.find((item) => item.status === 'reservada')!;
    donation.availableUntil = new Date(Date.now() - 60_000).toISOString();
    await writeDatabase(db);
    expect(await expireStaleRecords()).toBeGreaterThan(0);
    const result = await readDatabase();
    expect(result.donations.find((item) => item.id === donation.id)?.status).toBe('expirada');
    expect(result.reservations.find((item) => item.id === donation.reservationId)?.status).toBe('expirada');
  });

  it('calcula distancias e impacto con unidades configurables', () => {
    expect(haversineKm(19.2826, -99.6557, 19.2826, -99.6557)).toBe(0);
    expect(haversineKm(19.2826, -99.6557, 19.3, -99.6557)).toBeGreaterThan(1.9);
    expect(estimatedKg(10, 'piezas')).toBeCloseTo(1.8);
  });

  it('exporta CSV UTF-8 con BOM', async () => {
    const csv = await exportCsv('users');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('admin@robinfood.mx');
    expect(csv).not.toContain('passwordHash');
    expect(csv).not.toContain('salt');
  });

  it('inicializa la base y aporta donaciones de demostración', async () => {
    await initialize();
    expect((await readDatabase()).donations.length).toBeGreaterThanOrEqual(14);
  });
});
