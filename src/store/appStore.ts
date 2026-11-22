import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Database, PublicUser } from '@/types/models';
import {
  initialize, loadSignedInProfile, logout as signOutFirebase, observeAuth,
  snapshot, subscribeToSnapshot,
} from '@/services/foodService';
import { isDemoMode } from '@/services/firebase/mode';

const SESSION_KEY = 'robinfood:session:v1';
let stopAuthObserver: (() => void) | undefined;
let stopSnapshotObserver: (() => void) | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
interface StoredSession {
  user: PublicUser;
  expiresAt: number;
}

interface AppState {
  user: PublicUser | null;
  database: Database | null;
  ready: boolean;
  initializationError: string | null;
  hydrate: () => Promise<void>;
  setUser: (user: PublicUser) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  database: null,
  ready: false,
  initializationError: null,
  hydrate: async () => {
    if (!isDemoMode && stopAuthObserver) return;
    try {
      await initialize();
      if (!isDemoMode) {
        await new Promise<void>((resolve) => {
          let firstAuthEvent = true;
          stopAuthObserver = observeAuth((authUser) => {
            void (async () => {
              stopSnapshotObserver?.();
              stopSnapshotObserver = undefined;
              if (!authUser) {
                set({ user: null, database: null, ready: true, initializationError: null });
                if (firstAuthEvent) resolve();
                firstAuthEvent = false;
                return;
              }
              try {
                const user = await loadSignedInProfile();
                if (!user) throw new Error('No se pudo cargar el perfil de la cuenta.');
                set({ user, database: await snapshot(), ready: true, initializationError: null });
                stopSnapshotObserver = subscribeToSnapshot(user, () => {
                  if (refreshTimer) clearTimeout(refreshTimer);
                  refreshTimer = setTimeout(() => {
                    refreshTimer = undefined;
                    void get().refresh().catch((error: unknown) => {
                      set({ initializationError: error instanceof Error ? error.message : 'No se pudo sincronizar la información.' });
                    });
                  }, 100);
                }, (error) => set({ initializationError: error.message }));
              } catch (error) {
                set({
                  user: null,
                  database: null,
                  ready: true,
                  initializationError: error instanceof Error ? error.message : 'No se pudo cargar la cuenta.',
                });
              }
              if (firstAuthEvent) resolve();
              firstAuthEvent = false;
            })();
          }, (error) => {
            set({ ready: true, initializationError: error.message });
            if (firstAuthEvent) resolve();
            firstAuthEvent = false;
          });
        });
        return;
      }
      const saved = await AsyncStorage.getItem(SESSION_KEY);
      if (saved) {
        const session = JSON.parse(saved) as StoredSession;
        if (session.expiresAt > Date.now()) set({ user: session.user });
        else await AsyncStorage.removeItem(SESSION_KEY);
      }
      set({ database: await snapshot(), ready: true, initializationError: null });
    } catch (error) {
      set({
        ready: true,
        initializationError: error instanceof Error ? error.message : 'No se pudo iniciar Robin Food.',
      });
    }
  },
  setUser: async (user) => {
    if (isDemoMode) {
      const expiresAt = Date.now() + 30 * 24 * 60 * 60_000;
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user, expiresAt } satisfies StoredSession));
    }
    set({ user });
    await get().refresh();
  },
  refresh: async () => {
    if (!isDemoMode && !get().user) return;
    set({ database: await snapshot() });
  },
  logout: async () => {
    stopSnapshotObserver?.();
    stopSnapshotObserver = undefined;
    if (isDemoMode) {
      await AsyncStorage.removeItem(SESSION_KEY);
      set({ user: null, database: null });
    } else {
      await signOutFirebase();
      set({ user: null, database: null, initializationError: null });
    }
  },
}));
