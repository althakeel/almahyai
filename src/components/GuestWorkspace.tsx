import { useState, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import { orionApi, checkBackendHealth, checkGuestApiAvailable } from '../api/client';
import type { Conversation } from '../types';
import { useTheme } from '../hooks/useTheme';

const GUEST_CONVERSATION: Conversation = {
  id: 'guest-local',
  workspaceId: 'guest',
  title: 'Guest Chat',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface Props {
  onSignIn: () => void;
}

export default function GuestWorkspace({ onSignIn }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [guestRemaining, setGuestRemaining] = useState(20);
  const [guestLimit, setGuestLimit] = useState(20);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [guestApiReady, setGuestApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendHealth().then(setServerOnline);
    checkGuestApiAvailable().then(setGuestApiReady);
    orionApi.guest
      .limits()
      .then((data) => {
        setGuestRemaining(data.remaining);
        setGuestLimit(data.limit);
        setGuestApiReady(true);
      })
      .catch(() => setGuestApiReady(false));
  }, []);

  const used = Math.max(0, guestLimit - guestRemaining);
  const usagePct = guestLimit > 0 ? Math.min(100, (used / guestLimit) * 100) : 0;
  const lowMessages = guestRemaining <= 5 && guestRemaining > 0;

  return (
    <div className="workspace guest-workspace">
      <main className="main-content guest-main">
        <header className="guest-header">
          <div className="guest-header-left">
            <div className="guest-brand">
              <div className="logo-mark guest-logo">A</div>
              <div>
                <div className="guest-brand-title">Almahy AI</div>
                <div className="guest-brand-sub">Free guest session</div>
              </div>
            </div>
          </div>

          <div className="guest-header-center">
            <div className="guest-usage-card">
              <div className="guest-usage-labels">
                <span>Daily free messages</span>
                <span className={lowMessages ? 'guest-usage-warn' : ''}>
                  {guestRemaining} / {guestLimit} left
                </span>
              </div>
              <div className="guest-usage-track" role="progressbar" aria-valuenow={guestRemaining} aria-valuemin={0} aria-valuemax={guestLimit}>
                <div
                  className={`guest-usage-fill ${lowMessages ? 'low' : ''}`}
                  style={{ width: `${100 - usagePct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="guest-header-right">
            <span className={`guest-status-dot ${serverOnline ? 'online' : 'offline'}`}>
              {serverOnline === null ? '…' : serverOnline ? 'Online' : 'Offline'}
            </span>
            <button type="button" className="guest-theme-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button type="button" className="guest-signin-btn" onClick={onSignIn}>
              Sign in free
            </button>
          </div>
        </header>

        {guestApiReady === false && (
          <div className="guest-banner guest-banner-warn">
            <div className="guest-banner-icon">⚠</div>
            <div className="guest-banner-text">
              <strong>Guest chat is not available on the server yet.</strong>
              <span>Sign in for unlimited chat now, or ask your admin to update the cloud server.</span>
            </div>
            <button type="button" className="guest-banner-action" onClick={onSignIn}>
              Sign in
            </button>
          </div>
        )}

        {guestApiReady && guestRemaining <= 0 && (
          <div className="guest-banner guest-banner-limit">
            <div className="guest-banner-icon">⏱</div>
            <div className="guest-banner-text">
              <strong>Daily limit reached.</strong>
              <span>You used all {guestLimit} free messages today. Sign in for unlimited access.</span>
            </div>
            <button type="button" className="guest-banner-action" onClick={onSignIn}>
              Sign in
            </button>
          </div>
        )}

        <div className="guest-perks">
          <span className="guest-perk">✓ Text chat</span>
          <span className="guest-perk muted">Images need sign in</span>
          <span className="guest-perk muted">Unlimited with account</span>
        </div>

        <ChatPanel
          conversation={GUEST_CONVERSATION}
          userName="Guest"
          guestMode
          guestRemaining={guestRemaining}
          guestLimit={guestLimit}
          guestApiReady={guestApiReady !== false}
          onGuestRemainingChange={setGuestRemaining}
          onSignInRequired={onSignIn}
          onTitleUpdate={() => {}}
        />
      </main>
    </div>
  );
}
