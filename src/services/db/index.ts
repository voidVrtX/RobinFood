import type { DemoDatabase, Donation, User } from '@/types/models';
import { emptyDatabase, migrate, readDatabase, writeDatabase, atomic } from './localDb';
import { seedDatabase } from './seed';

export type CollectionName = keyof DemoDatabase;
export interface Repo<T extends { id: string }> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  query(predicate: (item: T) => boolean): Promise<T[]>;
}

export class LocalRepo<T extends { id: string }> implements Repo<T> {
  constructor(private readonly collection: CollectionName) {}
  async all(): Promise<T[]> {
    await new Promise((resolve) => setTimeout(resolve, 12));
    return (await readDatabase())[this.collection] as unknown as T[];
  }
  async get(id: string): Promise<T | null> {
    return (await this.all()).find((item) => item.id === id) ?? null;
  }
  async create(item: T): Promise<T> {
    await atomic((database) => {
      const collection = database[this.collection] as unknown as T[];
      if (collection.some((entry) => entry.id === item.id)) throw new Error('El registro ya existe.');
      collection.push(item);
    });
    return item;
  }
  async update(id: string, patch: Partial<T>): Promise<T> {
    return atomic((database) => {
      const collection = database[this.collection] as unknown as T[];
      const index = collection.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error('No encontramos ese registro.');
      collection[index] = { ...collection[index], ...patch };
      return collection[index];
    });
  }
  async remove(id: string): Promise<void> {
    await atomic((database) => {
      const collection = database[this.collection] as unknown as T[];
      const index = collection.findIndex((entry) => entry.id === id);
      if (index >= 0) collection.splice(index, 1);
    });
  }
  async query(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.all()).filter(predicate);
  }
}

export const users = new LocalRepo<User>('users');
export const donations = new LocalRepo<Donation>('donations');
export const reservations = new LocalRepo<DemoDatabase['reservations'][number]>('reservations');
export const notifications = new LocalRepo<DemoDatabase['notifications'][number]>('notifications');
export const messages = new LocalRepo<DemoDatabase['messages'][number]>('messages');
export const accessRequests = new LocalRepo<DemoDatabase['accessRequests'][number]>('accessRequests');
export const auditLog = new LocalRepo<DemoDatabase['auditLog'][number]>('auditLog');
export const reports = new LocalRepo<DemoDatabase['reports'][number]>('reports');

export async function initializeDatabase(): Promise<void> {
  await migrate();
  const current = await readDatabase();
  if (current.users.length === 0) await seedDatabase();
}

export async function resetDatabase(): Promise<void> {
  await writeDatabase(emptyDatabase());
  await seedDatabase();
}
