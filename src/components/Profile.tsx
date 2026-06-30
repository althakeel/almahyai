import { useState, FormEvent } from 'react';
import type { User } from '../types';
import {
  changePassword,
  deleteFirebaseAccount,
  getSignInMethod,
  updateDisplayName,
  isEmailPasswordUser,
} from '../firebase/auth';
import { orionApi } from '../api/client';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
  onAccountDeleted: () => void;
}

export default function Profile({ user, onBack, onLogout, onUserUpdate, onAccountDeleted }: Props) {
  const signInMethod = getSignInMethod();
  const emailAccount = isEmailPasswordUser();

  const [displayName, setDisplayName] = useState(user.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNameMessage('Display name is required.');
      return;
    }
    setSavingName(true);
    setNameMessage('');
    try {
      await updateDisplayName(name);
      await orionApi.auth.updateProfile(name);
      onUserUpdate({ ...user, displayName: name });
      setNameMessage('Name updated.');
    } catch (err: unknown) {
      setNameMessage(err instanceof Error ? err.message : 'Could not update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    setPasswordMessage('');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed successfully.');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordMessage('Current password is incorrect.');
      } else {
        setPasswordMessage(err instanceof Error ? err.message : 'Could not change password.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      if (emailAccount) {
        await deleteFirebaseAccount(deletePassword);
      } else {
        await deleteFirebaseAccount();
      }
      try {
        await orionApi.auth.deleteAccount();
      } catch {
        // Firebase account already removed; backend cleanup is best-effort
      }
      setShowDeleteConfirm(false);
      onAccountDeleted();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setDeleteError('Password is incorrect.');
      } else if (code === 'auth/popup-closed-by-user') {
        setDeleteError('Google sign-in was cancelled. Try again to confirm deletion.');
      } else {
        setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button type="button" className="profile-back-btn" onClick={onBack}>
          ← Back to chat
        </button>
        <h1>Profile</h1>
        <p>Manage your Almahy AI account</p>
      </div>

      <div className="profile-card profile-hero">
        <div className="profile-avatar-lg">{user.displayName[0]?.toUpperCase()}</div>
        <div className="profile-hero-info">
          <div className="profile-hero-name">{user.displayName}</div>
          <div className="profile-hero-email">{user.email}</div>
          <span className="profile-badge">{signInMethod === 'google' ? 'Google account' : 'Email account'}</span>
        </div>
      </div>

      <div className="profile-card">
        <h2>Display name</h2>
        <form onSubmit={handleSaveName} className="profile-form">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
          />
          <button type="submit" className="profile-btn primary" disabled={savingName}>
            {savingName ? 'Saving…' : 'Save name'}
          </button>
        </form>
        {nameMessage && <p className={`profile-hint ${nameMessage.includes('updated') ? 'success' : 'error'}`}>{nameMessage}</p>}
      </div>

      {emailAccount && (
        <div className="profile-card">
          <h2>Change password</h2>
          <form onSubmit={handleChangePassword} className="profile-form stack">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <button type="submit" className="profile-btn primary" disabled={changingPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
          {passwordMessage && (
            <p className={`profile-hint ${passwordMessage.includes('success') ? 'success' : 'error'}`}>{passwordMessage}</p>
          )}
        </div>
      )}

      <div className="profile-card">
        <h2>Session</h2>
        <p className="profile-desc">Sign out of Almahy AI on this device.</p>
        <button type="button" className="profile-btn secondary" onClick={() => setShowSignOutConfirm(true)}>
          Sign out
        </button>
      </div>

      <div className="profile-card danger-zone">
        <h2>Delete account</h2>
        <p className="profile-desc">
          Permanently delete your account, chats, and data. This cannot be undone.
        </p>
        {emailAccount && (
          <input
            type="password"
            className="profile-delete-input"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Enter your password to confirm"
            autoComplete="current-password"
          />
        )}
        {!emailAccount && (
          <p className="profile-hint">You will be asked to sign in with Google again to confirm.</p>
        )}
        {deleteError && <p className="profile-hint error">{deleteError}</p>}
        <button
          type="button"
          className="profile-btn danger"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={emailAccount && !deletePassword.trim()}
        >
          Delete my account
        </button>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Sign out?"
        message="You will need to sign in again to use Almahy AI."
        confirmLabel="Sign out"
        onConfirm={() => {
          setShowSignOutConfirm(false);
          onLogout();
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete account?"
        message="All your chats and account data will be permanently removed. This action cannot be undone."
        confirmLabel="Delete forever"
        danger
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => !deleting && setShowDeleteConfirm(false)}
      />
    </div>
  );
}
