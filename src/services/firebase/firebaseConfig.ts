import type { FirebaseOptions } from 'firebase/app';

export function getFirebaseOptions(): FirebaseOptions {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Falta EXPO_PUBLIC_FIREBASE_API_KEY. Configura la API key web de RobinFood-FireB en el entorno local o de Render.');
  }

  return {
    apiKey,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'robinfood-fireb.firebaseapp.com',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'robinfood-fireb',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'robinfood-fireb.firebasestorage.app',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '103933308733',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:103933308733:web:1e65bbb2c6c44b5523df54',
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-N19ZRCH96J',
  };
}
