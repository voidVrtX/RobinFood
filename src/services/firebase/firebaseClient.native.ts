import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getFirebaseOptions } from './firebaseConfig';
import type { FirebaseClient } from './firebaseClient.types';
import { reactNativePersistence } from './reactNativePersistence';

let client: FirebaseClient | undefined;

export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  const app = getApps().length ? getApp() : initializeApp(getFirebaseOptions());
  let auth: Auth;
  try {
    auth = initializeAuth(app, { persistence: reactNativePersistence });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'auth/already-initialized') throw error;
    auth = getAuth(app);
  }
  client = {
    app,
    auth,
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1'),
  };
  return client;
}
