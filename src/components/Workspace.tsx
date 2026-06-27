import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import type { User, Workspace as WorkspaceType, Conversation } from '../types';
import ChatPanel from './ChatPanel';
import { orionApi, checkBackendHealth } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

const Settings = lazy(() => import('./Settings'));

interface Props {
  user: User;
  onLogout: () => void;
}

export default function Workspace({ user, onLogout }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [provider, setProvider] = useState<'openai' | 'gemini'>('gemini');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [loading, setLoading] = useState(true);
  const [creatingChat, setCreatingChat] = useState(false);
  const [error, setError] = useState('');
  const bootstrapped = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    orionApi.config.chat().then((cfg) => {
      setProvider(cfg.provider);
      setModel(cfg.model);
    }).catch(() => {});
    checkBackendHealth().then(setServerOnline);
    const interval = window.setInterval(() => checkBackendHealth().then(setServerOnline), 60000);
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

  const handleDeleteConversation = async (id: string) => {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete chat');
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
            <button
              type="button"
              key={conv.id}
              className={`conversation-item ${activeConversation?.id === conv.id && view === 'chat' ? 'active' : ''}`}
              onClick={() => {
                setActiveConversation(conv);
                setView('chat');
                setError('');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (window.confirm(`Delete "${conv.title}"?`)) {
                  handleDeleteConversation(conv.id);
                }
              }}
            >
              <span className="chat-icon">💬</span>
              <span className="title">{conv.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          {user.isAdmin && (
            <button
              type="button"
              className={`sidebar-menu-btn ${view === 'settings' ? 'active' : ''}`}
              onClick={() => setView('settings')}
            >
              ⚙️ API Settings
            </button>
          )}
          <div className="user-menu">
            <div className="user-avatar">{user.displayName[0]?.toUpperCase()}</div>
            <div className="user-details">
              <span className="user-name">{user.displayName}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <button type="button" className="logout-btn" onClick={onLogout} title="Sign out">
              ↪
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
              <div className="brand-title">Orion AI</div>
              <div className="top-bar-status">
                <span className={`status-pill ${serverOnline ? 'online' : 'offline'}`}>
                  {serverOnline ? '● Cloud online' : '● Offline'}
                </span>
                <span className="status-pill model">{model}</span>
                <span className="status-pill">Gemini + Web</span>
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
        ) : loading ? (
          <div className="chat-loading">Loading chats...</div>
        ) : activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            userName={user.displayName}
            simpleMode={!user.isAdmin}
            onTitleUpdate={(title) => {
              setConversations((prev) =>
                prev.map((c) => (c.id === activeConversation.id ? { ...c, title } : c))
              );
              setActiveConversation({ ...activeConversation, title });
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
    </div>
  );
}
