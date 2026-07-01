import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import type { User, Workspace as WorkspaceType, Conversation } from '../types';
import ChatPanel from './ChatPanel';
import ConfirmDialog from './ConfirmDialog';
import { orionApi, checkBackendHealth, fetchEngineStatus, type EngineStatus } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

const Settings = lazy(() => import('./Settings'));
const Profile = lazy(() => import('./Profile'));

interface Props {
  user: User;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
}

export default function Workspace({ user, onLogout, onUserUpdate }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'profile'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const serverNeedsUpdate = serverOnline && engines === null;
  const provider = 'gemini' as const;
  const model = 'gemini-2.5-flash';
  const [loading, setLoading] = useState(true);
  const [creatingChat, setCreatingChat] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title?: string } | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const bootstrapped = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkBackendHealth().then(setServerOnline);
    fetchEngineStatus().then(setEngines);
    const interval = window.setInterval(() => {
      checkBackendHealth().then(setServerOnline);
      fetchEngineStatus().then(setEngines);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  const ensureWorkspace = useCallback(async (): Promise<WorkspaceType> => {
    if (activeWorkspace) return activeWorkspace;

    const list = await orionApi.workspace.list();
    if (list.length > 0) {
      setActiveWorkspace(list[0]);
      return list[0];
    }

    const created = await orionApi.workspace.create('My Workspace');
    setActiveWorkspace(created);
    return created;
  }, [activeWorkspace]);

  const loadConversations = useCallback(async (workspace: WorkspaceType, autoSelect = true) => {
    const list = await orionApi.conversation.list(workspace.id);
    setConversations(list);
    if (autoSelect && list.length > 0) {
      setActiveConversation(list[0]);
      setView('chat');
    }
    return list;
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        setLoading(true);
        const workspace = await ensureWorkspace();
        const list = await loadConversations(workspace, true);

        if (list.length === 0) {
          const conv = await orionApi.conversation.create(
            workspace.id,
            'New Chat',
            'gemini',
            'gemini-2.5-flash'
          );
          setConversations([conv]);
          setActiveConversation(conv);
          setView('chat');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    })();
  }, [ensureWorkspace, loadConversations]);

  const createNewChat = useCallback(
    async (workspace: WorkspaceType) => {
      const conv = await orionApi.conversation.create(
        workspace.id,
        'New Chat',
        provider,
        model
      );
      setConversations((prev) => [conv, ...prev]);
      setActiveConversation(conv);
      setView('chat');
      setError('');
      return conv;
    },
    [provider, model]
  );

  const handleNewChat = useCallback(async () => {
    setView('chat');
    setCreatingChat(true);
    setError('');

    try {
      const workspace = await ensureWorkspace();
      await createNewChat(workspace);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create chat';
      setError(message);
    } finally {
      setCreatingChat(false);
    }
  }, [ensureWorkspace, createNewChat]);

  const handleDeleteConversation = (id: string, title?: string) => {
    setPendingDelete({ id, title });
  };

  const confirmDeleteConversation = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setDeleting(true);
    try {
      await orionApi.conversation.delete(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);

      if (activeConversation?.id === id) {
        if (remaining.length > 0) {
          setActiveConversation(remaining[0]);
          setView('chat');
        } else {
          const workspace = await ensureWorkspace();
          await createNewChat(workspace);
        }
      }
      setPendingDelete(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete chat');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllHistory = () => {
    if (conversations.length === 0) return;
    setDeleteAllError('');
    setPendingDeleteAll(true);
  };

  const deleteAllConversations = async () => {
    const results = await Promise.allSettled(
      conversations.map((c) => orionApi.conversation.delete(c.id))
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length === results.length) {
      const reason = failed[0].status === 'rejected' ? failed[0].reason : null;
      throw reason instanceof Error ? reason : new Error('Could not delete chats');
    }
  };

  const confirmDeleteAllHistory = async () => {
    setDeleting(true);
    setDeleteAllError('');
    try {
      const workspace = await ensureWorkspace();
      await deleteAllConversations();
      setConversations([]);
      setActiveConversation(null);
      setPendingDeleteAll(false);
      setError('');
      try {
        await createNewChat(workspace);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? `History deleted, but could not start a new chat: ${err.message}`
            : 'History deleted, but could not start a new chat.'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete history';
      setDeleteAllError(message);
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  useKeyboardShortcuts(
    {
      'ctrl+n': handleNewChat,
      'ctrl+k': () => {
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 50);
      },
      'ctrl+f': () => {
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 50);
      },
      escape: () => {
        setSearchOpen(false);
        setSearchQuery('');
      },
    },
    view === 'chat'
  );

  return (
    <div className="workspace">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="new-chat-btn"
            onClick={handleNewChat}
            disabled={creatingChat || loading}
          >
            <span className="icon">+</span>
            {creatingChat ? 'Creating...' : 'New chat'}
          </button>
          {(searchOpen || searchQuery) && (
            <div className="sidebar-search">
              <input
                ref={searchRef}
                type="search"
                placeholder="Search chats… (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="conversation-list">
          {filteredConversations.length === 0 && !loading && (
            <p className="sidebar-empty">
              {searchQuery ? 'No matching chats' : 'No chats yet — click New chat'}
            </p>
          )}
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-row ${activeConversation?.id === conv.id && view === 'chat' ? 'active' : ''}`}
            >
              <button
                type="button"
                className="conversation-item"
                onClick={() => {
                  setActiveConversation(conv);
                  setView('chat');
                  setError('');
                }}
              >
                <span className="chat-icon">💬</span>
                <span className="title">{conv.title}</span>
              </button>
              <button
                type="button"
                className="conversation-delete"
                title={`Delete "${conv.title}"`}
                aria-label={`Delete ${conv.title}`}
                onClick={() => handleDeleteConversation(conv.id, conv.title)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {conversations.length > 0 && (
          <div className="sidebar-history-actions">
            <button type="button" className="sidebar-history-btn danger" onClick={handleDeleteAllHistory}>
              Delete all history
            </button>
          </div>
        )}

        <div className="sidebar-bottom">
          {user.isAdmin && (
            <button
              type="button"
              className={`sidebar-menu-btn ${view === 'settings' ? 'active' : ''}`}
              onClick={() => setView('settings')}
            >
              ⚙️ Engine Settings
            </button>
          )}
          <div className="user-menu">
            <button
              type="button"
              className="user-menu-open"
              onClick={() => {
                setView('profile');
                setError('');
              }}
              title="Open profile"
            >
              <div className="user-avatar">{user.displayName[0]?.toUpperCase()}</div>
              <div className="user-details">
                <span className="user-name">{user.displayName}</span>
                <span className="user-email">{user.email}</span>
              </div>
              <span className="user-menu-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar advanced-top-bar">
          <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>

          {view === 'chat' && (
            <>
              <div className="brand-title">
                Almahy AI
                <span className="brand-version">v1.7.8</span>
              </div>
              <div className="top-bar-status">
                {serverNeedsUpdate && (
                  <span
                    className="status-pill offline"
                    title="Cloud server is on an old version — only Gemini runs until AWS is updated"
                  >
                    ⚠ Server update needed
                  </span>
                )}
                {engines?.allConnected && (
                  <span className="status-pill neural" title="Gemini + ChatGPT + Copilot merge every answer">
                    ◆ Neural Merge
                  </span>
                )}
                <span className={`status-pill ${serverOnline ? 'online' : 'offline'}`}>
                  {serverOnline ? '● Online' : '● Offline'}
                </span>
              </div>
            </>
          )}

          <div className="top-bar-actions">
            <button
              type="button"
              className="top-bar-btn"
              onClick={() => {
                setSearchOpen((v) => !v);
                if (!searchOpen) window.setTimeout(() => searchRef.current?.focus(), 50);
              }}
              title="Search chats (Ctrl+K)"
            >
              🔍
            </button>
            <button type="button" className="top-bar-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {serverNeedsUpdate && view === 'chat' && (
          <div className="workspace-error server-update-banner">
            Triple-engine merge (ChatGPT + Gemini + Copilot) is not active on the cloud server yet.
            Your PC keys in backend/.env are not used — update AWS: git pull, npm run build, pm2 restart,
            then add all 3 API keys in Engine Settings.
            <button type="button" onClick={() => setView('settings')}>Open Settings</button>
          </div>
        )}

        {error && (
          <div className="workspace-error">
            {error}
            <button type="button" onClick={() => setError('')}>×</button>
          </div>
        )}

        {view === 'settings' && user.isAdmin ? (
          <Suspense fallback={<div className="chat-loading">Loading settings...</div>}>
            <Settings />
          </Suspense>
        ) : view === 'profile' ? (
          <Suspense fallback={<div className="chat-loading">Loading profile...</div>}>
            <Profile
              user={user}
              onBack={() => setView('chat')}
              onLogout={onLogout}
              onUserUpdate={onUserUpdate}
              onAccountDeleted={onLogout}
            />
          </Suspense>
        ) : loading ? (
          <div className="chat-loading">Loading chats...</div>
        ) : activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            userName={user.displayName}
            simpleMode={!user.isAdmin}
            engineStatus={engines}
            onTitleUpdate={(title) => {
              setConversations((prev) =>
                prev.map((c) => (c.id === activeConversation.id ? { ...c, title } : c))
              );
              setActiveConversation({ ...activeConversation, title });
            }}
            onConversationCleared={() => {
              setConversations((prev) =>
                prev.map((c) => (c.id === activeConversation.id ? { ...c, title: 'New Chat' } : c))
              );
              setActiveConversation({ ...activeConversation, title: 'New Chat' });
            }}
          />
        ) : (
          <div className="chat-loading">
            <p>No chat selected</p>
            <button type="button" className="btn-primary" style={{ width: 'auto', marginTop: 12 }} onClick={handleNewChat}>
              Start New Chat
            </button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete chat?"
        message={
          pendingDelete?.title
            ? `Delete "${pendingDelete.title}"? This cannot be undone.`
            : 'Delete this chat? This cannot be undone.'
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDeleteConversation}
        onCancel={() => !deleting && setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingDeleteAll}
        title="Delete all history?"
        message={`Delete all ${conversations.length} chats? This permanently removes your entire chat history.`}
        confirmLabel="Delete all"
        danger
        loading={deleting}
        error={deleteAllError}
        onConfirm={confirmDeleteAllHistory}
        onCancel={() => {
          if (!deleting) {
            setPendingDeleteAll(false);
            setDeleteAllError('');
          }
        }}
      />
    </div>
  );
}
