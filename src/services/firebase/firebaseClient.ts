import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getFirebaseOptions } from './firebaseConfig';
import type { FirebaseClient } from './firebaseClient.types';

let client: FirebaseClient | undefined;

export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  const app = getApps().length ? getApp() : initializeApp(getFirebaseOptions());
  client = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1'),
  };
  return client;
}
