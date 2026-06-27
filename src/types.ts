export type ChatMode = 'general' | 'research' | 'code' | 'creative';

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  isAdmin: boolean;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  provider: 'openai' | 'gemini';
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: MessageImage | null;
  createdAt: string;
}

export interface MessageImage {
  mimeType: string;
  data: string;
}
