import { useState, useEffect, useCallback, useRef } from 'react';
import type { User, Workspace as WorkspaceType, Conversation } from '../types';
import ChatPanel from './ChatPanel';
import Settings from './Settings';
import { almahyApi } from '../api/client';

interface Props {
  user: User;
  onLogout: () => void;
}

export default function Workspace({ user, onLogout }: Props) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [provider, setProvider] = useState<'openai' | 'gemini'>('gemini');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [models, setModels] = useState<{ openai: string[]; gemini: string[] }>({ openai: [], gemini: [] });
  const [loading, setLoading] = useState(true);
  const [creatingChat, setCreatingChat] = useState(false);
  const [error, setError] = useState('');
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (user.isAdmin) {
      almahyApi.models.list().then(setModels).catch(() => {});
    } else {
      almahyApi.config.chat().then((cfg) => {
        setProvider(cfg.provider);
        setModel(cfg.model);
      }).catch(() => {});
    }
  }, [user.isAdmin]);

  const ensureWorkspace = useCallback(async (): Promise<WorkspaceType> => {
    if (activeWorkspace) return activeWorkspace;

    const list = await almahyApi.workspace.list();
    if (list.length > 0) {
      setActiveWorkspace(list[0]);
      return list[0];
    }

    const created = await almahyApi.workspace.create('My Workspace');
    setActiveWorkspace(created);
    return created;
  }, [activeWorkspace]);

  const loadConversations = useCallback(async (workspace: WorkspaceType, autoSelect = true) => {
    const list = await almahyApi.conversation.list(workspace.id);
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
          const conv = await almahyApi.conversation.create(
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
      const conv = await almahyApi.conversation.create(
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

  const handleNewChat = async () => {
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
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await almahyApi.conversation.delete(id);
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

  const handleProviderChange = (p: 'openai' | 'gemini') => {
    setProvider(p);
    setModel(p === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');
  };

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
        </div>

        <div className="conversation-list">
          {conversations.length === 0 && !loading && (
            <p className="sidebar-empty">No chats yet — click New chat</p>
          )}
          {conversations.map((conv) => (
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
                handleDeleteConversation(conv.id);
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
        <header className="top-bar">
          <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>

          {view === 'chat' && (
            user.isAdmin ? (
            <div className="model-bar">
              <div className="provider-toggle">
                <button
                  type="button"
                  className={provider === 'openai' ? 'active-openai' : ''}
                  onClick={() => handleProviderChange('openai')}
                >
                  OpenAI
                </button>
                <button
                  type="button"
                  className={provider === 'gemini' ? 'active-gemini' : ''}
                  onClick={() => handleProviderChange('gemini')}
                >
                  Gemini
                </button>
              </div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="model-select"
              >
                {(provider === 'openai' ? models.openai : models.gemini).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            ) : (
            <div className="brand-title">Almahy AI</div>
            )
          )}
        </header>

        {error && (
          <div className="workspace-error">
            {error}
            <button type="button" onClick={() => setError('')}>×</button>
          </div>
        )}

        {view === 'settings' && user.isAdmin ? (
          <Settings />
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
