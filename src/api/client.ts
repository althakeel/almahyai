import { waitForAuthUser } from '../firebase/auth';
import type { User, Workspace, Conversation, Message, MessageImage, ChatMode } from '../types';

/** Local dev uses Vite proxy; packaged EXE talks to AWS backend on port 3847. */
const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://3.111.219.248:3847/api');

async function getToken(): Promise<string> {
  const user = await waitForAuthUser();
  return user.getIdToken();
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error(
        response.status === 404
          ? 'Guest chat is not enabled on the server yet. Sign in for full access, or ask the admin to update the cloud server.'
          : 'Server returned an error page instead of data. Try again or sign in.'
      );
    }
    throw new Error('Invalid response from server. Try again or sign in.');
  }
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

  const data = await parseJsonResponse<T & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data as T;
}

async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const data = await parseJsonResponse<T & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data as T;
}

export interface GuestLimits {
  used: number;
  remaining: number;
  limit: number;
}

export async function checkBackendHealth(timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function checkGuestApiAvailable(timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/guest/limits`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true && typeof data.remaining === 'number';
  } catch {
    return false;
  }
}

export const orionApi = {
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
      image?: MessageImage | null,
      mode?: ChatMode
    ) =>
      apiFetch<{ success: boolean; content?: string; messageId?: string; image?: MessageImage | null; error?: string }>(
        `/conversations/${conversationId}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({ message, provider, model, image: image ?? null, mode: mode ?? 'general' }),
        }
      ),
  },
  guest: {
    limits: () => publicFetch<{ success: boolean } & GuestLimits>('/guest/limits'),
    chat: (
      message: string,
      history: Array<{ role: string; content: string }>,
      mode?: ChatMode
    ) =>
      publicFetch<{
        success: boolean;
        content: string;
        used: number;
        remaining: number;
        limit: number;
      }>('/guest/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history, mode: mode ?? 'general' }),
      }),
  },
};
