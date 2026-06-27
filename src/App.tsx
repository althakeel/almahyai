import { useState, useEffect, useCallback, lazy, Suspense, type ReactNode } from 'react';

import type { User } from './types';

import Login from './components/Login';

import GuestWorkspace from './components/GuestWorkspace';

import { subscribeToAuth, firebaseLogout, resolveGoogleRedirect } from './firebase/auth';

import { auth } from './firebase/config';

import { orionApi, checkBackendHealth } from './api/client';



const HackerBootSplash = lazy(() => import('./components/HackerBootSplash'));

const Workspace = lazy(() => import('./components/Workspace'));



const BOOT_SEEN_KEY = 'orion-boot-seen';



const backendUnavailableMessage = import.meta.env.DEV

  ? 'Backend not running. Open a terminal and run: cd backend && npm run dev'

  : 'Cannot reach Orion AI servers. The cloud server may be offline — ask the administrator to run deploy/setup-server.sh on AWS.';



function LoadingFallback({ message = 'Loading Orion AI...' }: { message?: string }) {

  return (

    <div className="loading-screen">

      <div className="logo-mark">O</div>

      <p>{message}</p>

    </div>

  );

}



export default function App() {

  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  const [authChecked, setAuthChecked] = useState(false);

  const [authError, setAuthError] = useState('');

  const [authView, setAuthView] = useState<'guest' | 'login'>('guest');

  const [bootComplete, setBootComplete] = useState(

    () => localStorage.getItem(BOOT_SEEN_KEY) === '1'

  );

  const [bootExiting, setBootExiting] = useState(false);



  const finishBoot = useCallback(() => {

    localStorage.setItem(BOOT_SEEN_KEY, '1');

    setBootExiting(true);

    window.setTimeout(() => setBootComplete(true), 200);

  }, []);



  const handleBootComplete = useCallback(() => {

    finishBoot();

  }, [finishBoot]);



  useEffect(() => {

    resolveGoogleRedirect().catch(() => {});

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



      setAuthView('login');

      setAuthChecked(true);

      setLoading(true);

      import('./components/Workspace').catch(() => {});



      try {

        await auth.authStateReady();

        if (cancelled || auth.currentUser?.uid !== fbUser.uid) {

          setLoading(false);

          return;

        }



        const backendOk = await checkBackendHealth(4000);

        if (!backendOk) {

          setAuthError(backendUnavailableMessage);

          setUser(null);

          await firebaseLogout();

          setLoading(false);

          return;

        }



        const displayName = fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User';

        const result = await orionApi.auth.syncFirebaseUser(displayName);



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

    setAuthView('guest');

  };



  const sessionValid = user && auth.currentUser;



  let mainContent: ReactNode;



  if (sessionValid) {

    mainContent = <Workspace key={auth.currentUser!.uid} user={user} onLogout={handleLogout} />;

  } else if (loading && bootComplete) {

    mainContent = <LoadingFallback message="Connecting to Orion cloud..." />;

  } else if (authView === 'login') {

    mainContent = (

      <Login

        authError={authError}

        onClearError={() => setAuthError('')}

        onContinueAsGuest={() => setAuthView('guest')}

      />

    );

  } else {

    mainContent = <GuestWorkspace onSignIn={() => setAuthView('login')} />;

  }



  if (!bootComplete) {

    return (

      <div className={`hacker-boot-wrapper${bootExiting ? ' boot-exiting' : ''}`}>

        <Suspense fallback={<LoadingFallback />}>

          <HackerBootSplash

            ready={authChecked}

            onComplete={handleBootComplete}

            onSkip={finishBoot}

          />

        </Suspense>

      </div>

    );

  }



  return (

    <div className="app-shell app-fade-in">

      <Suspense fallback={<LoadingFallback />}>{mainContent}</Suspense>

    </div>

  );

}


