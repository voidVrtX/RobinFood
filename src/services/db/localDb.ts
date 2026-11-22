import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DemoDatabase } from '@/types/models';

export const DB_VERSION = 2;
const DB_KEY = 'robinfood:v1:database';
const VERSION_KEY = 'robinfood:dbVersion';

export const emptyDatabase = (): DemoDatabase => ({
  users: [],
  donations: [],
  reservations: [],
  notifications: [],
  messages: [],
  accessRequests: [],
  auditLog: [],
  reports: [],
});

export async function readDatabase(): Promise<DemoDatabase> {
  const raw = await AsyncStorage.getItem(DB_KEY);
  if (!raw) return emptyDatabase();
  try {
    return { ...emptyDatabase(), ...(JSON.parse(raw) as Partial<DemoDatabase>) };
  } catch {
    return emptyDatabase();
  }
}

export async function writeDatabase(database: DemoDatabase): Promise<void> {
  await AsyncStorage.setItem(DB_KEY, JSON.stringify(database));
}

export async function migrate(): Promise<void> {
  const version = Number(await AsyncStorage.getItem(VERSION_KEY) ?? 0);
  if (version < DB_VERSION) {
    const current = await readDatabase();
    current.users = current.users.map((user) => ({
      ...user,
      prefs: {
        ...user.prefs,
        pushNotifications: user.prefs.pushNotifications ?? false,
        camera: user.prefs.camera ?? false,
      },
    }));
    current.donations = current.donations.map((donation) => ({
      ...donation,
      availableUntil: donation.availableUntil ?? null,
    }));
    await writeDatabase(current);
    await AsyncStorage.setItem(VERSION_KEY, String(DB_VERSION));
  }
}

let transaction = Promise.resolve();
export function withDatabaseLock<T>(work: () => Promise<T>): Promise<T> {
  const next = transaction.then(work, work);
  transaction = next.then(() => undefined, () => undefined);
  return next;
}

export async function atomic<T>(work: (database: DemoDatabase) => Promise<T> | T): Promise<T> {
  return withDatabaseLock(async () => {
    const before = await readDatabase();
    const copy = JSON.parse(JSON.stringify(before)) as DemoDatabase;
    try {
      const result = await work(copy);
      await writeDatabase(copy);
      return result;
    } catch (error) {
      await writeDatabase(before);
      throw error;
    }
  });
}

export const databaseKey = DB_KEY;
