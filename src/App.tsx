import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react';

import type { User } from './types';

import Login from './components/Login';

import { subscribeToAuth, firebaseLogout, resolveGoogleRedirect } from './firebase/auth';

import { auth } from './firebase/config';

import { orionApi, checkBackendHealth } from './api/client';

const Workspace = lazy(() => import('./components/Workspace'));

const backendUnavailableMessage = import.meta.env.DEV
  ? 'Backend not running. Open a terminal and run: cd backend && npm run dev'
  : 'Cannot reach Almahy AI servers. The cloud server may be offline — ask the administrator to update AWS.';

function LoadingFallback({ message = 'Loading Almahy AI...' }: { message?: string }) {
  return (
    <div className="loading-screen">
      <div className="logo-mark">A</div>
      <p>{message}</p>
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    resolveGoogleRedirect().catch(() => {});
    import('./components/Workspace').catch(() => {});
    auth.authStateReady().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToAuth(async (fbUser) => {
      if (cancelled) return;

      if (!fbUser) {
        setUser(null);
        setLoading(false);
        setAuthChecked(true);
        return;
      }

      setAuthChecked(true);
      setLoading(true);

      try {
        const [, backendOk] = await Promise.all([
          auth.authStateReady(),
          checkBackendHealth(2500),
        ]);

        if (cancelled || auth.currentUser?.uid !== fbUser.uid) {
          setLoading(false);
          return;
        }

        if (!backendOk) {
          setAuthError(backendUnavailableMessage);
          setUser(null);
          await firebaseLogout();
          setLoading(false);
          return;
        }

        const displayName = fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User';
        const result = await withTimeout(
          orionApi.auth.syncFirebaseUser(displayName),
          12000,
          'Connection timed out. Check your internet and try again.'
        );

        if (cancelled) return;

        if (result.success && result.user && auth.currentUser?.uid === fbUser.uid) {
          setAuthError('');
          setUser(result.user);
        } else {
          setAuthError(result.error ?? 'Failed to sync account. Please try again.');
          setUser(null);
          await firebaseLogout();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Backend connection failed';
        setAuthError(
          import.meta.env.DEV
            ? `${message}. Make sure backend is running on port 3847.`
            : message
        );
        setUser(null);
        await firebaseLogout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await firebaseLogout();
    setUser(null);
  };

  const handleUserUpdate = (updated: User) => {
    setUser(updated);
  };

  const sessionValid = user && auth.currentUser;

  let mainContent: ReactNode;

  if (sessionValid) {
    mainContent = (
      <Workspace
        key={auth.currentUser!.uid}
        user={user}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
    );
  } else if (loading && authChecked) {
    mainContent = <LoadingFallback message="Signing in…" />;
  } else {
    mainContent = <Login authError={authError} onClearError={() => setAuthError('')} />;
  }

  return (
    <div className="app-shell app-fade-in">
      <Suspense fallback={<LoadingFallback />}>{mainContent}</Suspense>
    </div>
  );
}
