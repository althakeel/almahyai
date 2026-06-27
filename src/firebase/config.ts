import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCNilmWe6KWaWeF1Myk5qCe5838Mn8Dzmg',
  authDomain: 'almahy-ai.firebaseapp.com',
  projectId: 'almahy-ai',
  storageBucket: 'almahy-ai.firebasestorage.app',
  messagingSenderId: '869396685565',
  appId: '1:869396685565:web:2fd56426ce9398560f9494',
  measurementId: 'G-0685R82NY8',
};

const app = initializeApp(firebaseConfig);

function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();
