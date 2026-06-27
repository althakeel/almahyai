import { useState, FormEvent, useEffect } from 'react';
import { firebaseRegister, firebaseLogin, firebaseGoogleLogin } from '../firebase/auth';
import { checkBackendHealth } from '../api/client';
import { IconGoogle } from './Icons';
function getFirebaseErrorMessage(code: string, message?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try Sign In instead.';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Enable Email/Password or Google in Firebase Console → Authentication.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.';
    case 'auth/internal-error':
      return 'Sign-in failed (Firebase internal error). Restart the app and try again.';
    case 'auth/unauthorized-domain':
      return 'This app domain is not authorized. Contact support.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already registered with password. Sign in with email instead.';
    case 'auth/popup-blocked':
      return 'Popup blocked. Retrying with redirect...';
    case 'auth/argument-error':
      return 'Opening Google sign-in in your browser...';
    default:
      return message || 'Authentication failed. Please try again.';
  }
}

interface Props {
  authError?: string;
  onClearError?: () => void;
  onContinueAsGuest?: () => void;
}

export default function Login({ authError = '', onClearError, onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    checkBackendHealth().then(setServerOnline);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    onClearError?.();
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) {
          setError('Display name is required');
          return;
        }
        await firebaseRegister(email.trim(), password, displayName.trim());
      } else {
        await firebaseLogin(email.trim(), password);
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      setError(getFirebaseErrorMessage(fbErr.code ?? '', fbErr.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    onClearError?.();
    setLoading(true);

    let redirecting = false;

    try {
      await firebaseGoogleLogin();
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.message === 'REDIRECT_IN_PROGRESS') {
        redirecting = true;
        setError('Opening Google sign-in… complete it in the browser window.');
        return;
      }
      setError(getFirebaseErrorMessage(fbErr.code ?? '', fbErr.message));
    } finally {
      if (!redirecting) setLoading(false);
    }
  };

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    onClearError?.();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-mark">O</div>
          <h1>Orion AI</h1>
          <p>Sign in for unlimited chat &amp; images</p>
        </div>

        {onContinueAsGuest && (
          <button type="button" className="btn-guest-link" onClick={onContinueAsGuest}>
            ← Continue as Guest (20 free messages/day)
          </button>
        )}

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Create Account
          </button>
        </div>

        <button
          type="button"
          className="btn-google"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <IconGoogle size={20} />
          <span>{loading ? 'Please wait...' : 'Continue with Google'}</span>
        </button>

        <div className="auth-divider">
          <span>or use email</span>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading || serverOnline === false}>
            {loading ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {serverOnline === false && (
            <p className="error-msg">
              Orion AI cloud server is offline or not configured yet.
              Open http://3.111.219.248:3847/api/health in a browser — it must show
              {` {"ok":true,...} `}
              before the app can sign in.
            </p>
          )}

          {error && <p className="error-msg">{error}</p>}
        </form>

        {onContinueAsGuest && (
          <p className="auth-guest-note">
            No account?{' '}
            <button type="button" className="link-btn" onClick={onContinueAsGuest}>
              Try 20 free messages without signing in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
