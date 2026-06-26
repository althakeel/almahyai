import { waitForAuthUser } from '../firebase/auth';
import type { User, Workspace, Conversation, Message, MessageImage } from '../types';

/** Local dev uses Vite proxy; packaged EXE talks to AWS backend on port 3847. */
const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://3.111.219.248:3847/api');

async function getToken(): Promise<string> {
  const user = await waitForAuthUser();
  return user.getIdToken();
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data as T;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

export const almahyApi = {
  auth: {
    syncFirebaseUser: async (displayName: string) => {
      return apiFetch<{ success: boolean; user?: User; error?: string }>('/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      });
    },
    getCurrentUser: async () => {
      return apiFetch<{ success: boolean; user: User }>('/auth/me');
    },
  },
  models: {
    list: () => apiFetch<{ openai: string[]; gemini: string[] }>('/models'),
  },
  config: {
    chat: () => apiFetch<{ provider: 'openai' | 'gemini'; model: string; brandName: string }>('/config/chat'),
  },
  keys: {
    status: () => apiFetch<{ hasOpenai: boolean; hasGemini: boolean }>('/keys/status'),
    save: (openaiKey: string | null, geminiKey: string | null) =>
      apiFetch<{ success: boolean }>('/keys', {
        method: 'POST',
        body: JSON.stringify({ openaiKey, geminiKey }),
      }),
    testOpenai: (apiKey: string) =>
      apiFetch<{ valid: boolean; error?: string }>('/keys/test/openai', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    testGemini: (apiKey: string) =>
      apiFetch<{ valid: boolean; error?: string }>('/keys/test/gemini', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
  },
  workspace: {
    list: () => apiFetch<Workspace[]>('/workspaces'),
    create: (name: string) =>
      apiFetch<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  conversation: {
    list: (workspaceId: string) => apiFetch<Conversation[]>(`/workspaces/${workspaceId}/conversations`),
    create: (workspaceId: string, title: string, provider: 'openai' | 'gemini', model: string) =>
      apiFetch<Conversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ title, provider, model }),
      }),
    rename: (conversationId: string, title: string) =>
      apiFetch<{ success: boolean }>(`/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    delete: (conversationId: string) =>
      apiFetch<{ success: boolean }>(`/conversations/${conversationId}`, {
        method: 'DELETE',
      }),
  },
  messages: {
    list: (conversationId: string) => apiFetch<Message[]>(`/conversations/${conversationId}/messages`),
  },
  chat: {
    send: (
      conversationId: string,
      message: string,
      provider: 'openai' | 'gemini',
      model: string,
      image?: MessageImage | null
    ) =>
      apiFetch<{ success: boolean; content?: string; messageId?: string; error?: string }>(
        `/conversations/${conversationId}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({ message, provider, model, image: image ?? null }),
        }
      ),
  },
};
