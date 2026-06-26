import { useState, useEffect } from 'react';
import type { User } from './types';
import Login from './components/Login';
import Workspace from './components/Workspace';
import { subscribeToAuth, firebaseLogout } from './firebase/auth';
import { auth } from './firebase/config';
import { almahyApi, checkBackendHealth } from './api/client';

const backendUnavailableMessage = import.meta.env.DEV
  ? 'Backend not running. Open a terminal and run: cd backend && npm run dev'
  : 'Cannot reach Almahy AI servers. The cloud server may be offline — ask the administrator to run deploy/setup-server.sh on AWS.';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToAuth(async (fbUser) => {
      if (cancelled) return;

      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await auth.authStateReady();
        if (cancelled || auth.currentUser?.uid !== fbUser.uid) return;

        const backendOk = await checkBackendHealth();
        if (!backendOk) {
          setAuthError(backendUnavailableMessage);
          setUser(null);
          await firebaseLogout();
          return;
        }

        const displayName = fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User';
        const result = await almahyApi.auth.syncFirebaseUser(displayName);

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
            : `${message}. Please try again in a moment.`
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

  const sessionValid = user && auth.currentUser;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="logo-mark">A</div>
        <p>Loading Almahy AI...</p>
      </div>
    );
  }

  if (!sessionValid) {
    const message =
      user && !auth.currentUser
        ? 'Session expired. Please sign in again.'
        : authError;
    return <Login authError={message} onClearError={() => setAuthError('')} />;
  }

  return <Workspace key={auth.currentUser!.uid} user={user} onLogout={handleLogout} />;
}
