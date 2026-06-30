import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  updatePassword,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './config';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/argument-error' ||
      code === 'auth/popup-closed-by-user'
    ) {
      if (code === 'auth/popup-closed-by-user') throw err;
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

export function isEmailPasswordUser(): boolean {
  return auth.currentUser?.providerData.some((p) => p.providerId === 'password') ?? false;
}

export function getSignInMethod(): 'email' | 'google' | 'other' {
  const providers = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
  if (providers.includes('password')) return 'email';
  if (providers.includes('google.com')) return 'google';
  return 'other';
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await updateProfile(user, { displayName: displayName.trim() });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Email account required');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function deleteFirebaseAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  if (isEmailPasswordUser()) {
    if (!user.email || !password) throw new Error('Password required');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (getSignInMethod() === 'google') {
    await reauthenticateWithPopup(user, googleProvider);
  }

  await deleteUser(user);
}
