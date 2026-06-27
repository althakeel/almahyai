import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './config';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function isElectronApp(): boolean {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
}

export async function firebaseRegister(
  email: string,
  password: string,
  displayName: string
): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential.user;
}

export async function firebaseLogin(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function firebaseGoogleLogin(): Promise<FirebaseUser> {
  if (isElectronApp()) {
    await signInWithRedirect(auth, googleProvider);
    throw new Error('REDIRECT_IN_PROGRESS');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/argument-error'
    ) {
      await signInWithRedirect(auth, googleProvider);
      throw new Error('REDIRECT_IN_PROGRESS');
    }
    throw err;
  }
}

export async function resolveGoogleRedirect(): Promise<FirebaseUser | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export async function firebaseLogout(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function waitForAuthUser(): Promise<FirebaseUser> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsub();
      reject(new Error('Not signed in'));
    }, 8000);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.clearTimeout(timeout);
        unsub();
        resolve(user);
      }
    });
  });
}

export function mapFirebaseUser(fbUser: FirebaseUser) {
  return {
    uid: fbUser.uid,
    email: fbUser.email ?? '',
    displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
  };
}
