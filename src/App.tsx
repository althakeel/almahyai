import { useState, useEffect } from 'react';
import type { User } from './types';
import Login from './components/Login';
import Workspace from './components/Workspace';
import { subscribeToAuth, firebaseLogout } from './firebase/auth';
import { almahyApi, checkBackendHealth } from './api/client';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const backendOk = await checkBackendHealth();
      if (!backendOk) {
        setAuthError(
          'Backend not running. Open a terminal and run: cd backend && npm run dev'
        );
        setLoading(false);
        return;
      }

      unsubscribe = subscribeToAuth(async (fbUser) => {
        if (fbUser) {
          const displayName = fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User';
          try {
            const result = await almahyApi.auth.syncFirebaseUser(displayName);
            if (result.success && result.user) {
              setAuthError('');
              setUser(result.user);
            } else {
              setAuthError(result.error ?? 'Failed to sync account. Please try again.');
              setUser(null);
              await firebaseLogout();
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Backend connection failed';
            setAuthError(`${message}. Make sure backend is running on port 3847.`);
            setUser(null);
            await firebaseLogout();
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      });
    })();

    return () => unsubscribe?.();
  }, []);

  const handleLogout = async () => {
    await firebaseLogout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="logo-mark">A</div>
        <p>Loading Almahy AI...</p>
      </div>
    );
  }

  if (!user) {
    return <Login authError={authError} onClearError={() => setAuthError('')} />;
  }

  return <Workspace user={user} onLogout={handleLogout} />;
}
