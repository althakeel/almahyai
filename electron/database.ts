import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const ENCRYPTION_ALGO = 'aes-256-gcm';

function getDbPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'almahy-ai.db');
}

function getEncryptionKey(): Buffer {
  const userData = app.getPath('userData');
  const keyPath = path.join(userData, '.key');
  const fs = require('fs') as typeof import('fs');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key);
  return key;
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
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
  createdAt: string;
}

export interface ApiKeys {
  openaiKey: string | null;
  geminiKey: string | null;
}

let db: Database.Database;

export function initDatabase(): void {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrateLegacyUsersTable();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      user_id TEXT PRIMARY KEY,
      openai_key TEXT,
      gemini_key TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);
}

function migrateLegacyUsersTable(): void {
  const tableInfo = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get() as { name: string } | undefined;

  if (!tableInfo) return;

  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const hasLegacyAuth = columns.some((c) => c.name === 'password_hash' || c.name === 'username');
  if (!hasLegacyAuth) return;

  db.exec(`
    ALTER TABLE users RENAME TO users_legacy;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    DROP TABLE users_legacy;
  `);
}

export function ensureFirebaseUser(firebaseUid: string, email: string, displayName: string): User {
  const now = new Date().toISOString();
  const normalizedEmail = email.toLowerCase();

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(firebaseUid) as
    | { id: string; email: string; display_name: string; created_at: string }
    | undefined;

  if (existing) {
    db.prepare('UPDATE users SET email = ?, display_name = ? WHERE id = ?').run(
      normalizedEmail,
      displayName,
      firebaseUid
    );
    ensureUserSetup(firebaseUid);
    return {
      id: existing.id,
      email: normalizedEmail,
      displayName,
      createdAt: existing.created_at,
    };
  }

  const emailConflict = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: string }
    | undefined;

  if (emailConflict && emailConflict.id !== firebaseUid) {
    db.prepare('DELETE FROM users WHERE id = ?').run(emailConflict.id);
  }

  db.prepare(
    'INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)'
  ).run(firebaseUid, normalizedEmail, displayName, now);

  ensureUserSetup(firebaseUid);

  return { id: firebaseUid, email: normalizedEmail, displayName, createdAt: now };
}

function ensureUserSetup(userId: string): void {
  const apiKeys = db.prepare('SELECT user_id FROM api_keys WHERE user_id = ?').get(userId);
  if (!apiKeys) {
    db.prepare('INSERT INTO api_keys (user_id, openai_key, gemini_key) VALUES (?, NULL, NULL)').run(
      userId
    );
  }

  const workspace = db.prepare('SELECT id FROM workspaces WHERE user_id = ?').get(userId);
  if (!workspace) {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO workspaces (id, user_id, name, created_at) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), userId, 'My Workspace', now);
  }
}

export function getUserById(userId: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | { id: string; email: string; display_name: string; created_at: string }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function saveApiKeys(userId: string, keys: ApiKeys): void {
  const openaiEncrypted = keys.openaiKey ? encrypt(keys.openaiKey) : null;
  const geminiEncrypted = keys.geminiKey ? encrypt(keys.geminiKey) : null;

  db.prepare(
    'UPDATE api_keys SET openai_key = ?, gemini_key = ? WHERE user_id = ?'
  ).run(openaiEncrypted, geminiEncrypted, userId);
}

export function getApiKeys(userId: string): ApiKeys {
  const row = db.prepare('SELECT * FROM api_keys WHERE user_id = ?').get(userId) as
    | { openai_key: string | null; gemini_key: string | null }
    | undefined;

  if (!row) return { openaiKey: null, geminiKey: null };

  return {
    openaiKey: row.openai_key ? decrypt(row.openai_key) : null,
    geminiKey: row.gemini_key ? decrypt(row.gemini_key) : null,
  };
}

export function getApiKeysStatus(userId: string): { hasOpenai: boolean; hasGemini: boolean } {
  const row = db.prepare('SELECT openai_key, gemini_key FROM api_keys WHERE user_id = ?').get(userId) as
    | { openai_key: string | null; gemini_key: string | null }
    | undefined;

  return {
    hasOpenai: !!row?.openai_key,
    hasGemini: !!row?.gemini_key,
  };
}

export function getWorkspaces(userId: string): Workspace[] {
  const rows = db.prepare('SELECT * FROM workspaces WHERE user_id = ? ORDER BY created_at').all(userId) as Array<{
    id: string;
    user_id: string;
    name: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    createdAt: r.created_at,
  }));
}

export function createWorkspace(userId: string, name: string): Workspace {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO workspaces (id, user_id, name, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    name,
    now
  );
  return { id, userId, name, createdAt: now };
}

export function getConversations(workspaceId: string): Conversation[] {
  const rows = db
    .prepare('SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC')
    .all(workspaceId) as Array<{
    id: string;
    workspace_id: string;
    title: string;
    provider: string;
    model: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    provider: r.provider as 'openai' | 'gemini',
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createConversation(
  workspaceId: string,
  title: string,
  provider: 'openai' | 'gemini',
  model: string
): Conversation {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO conversations (id, workspace_id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, workspaceId, title, provider, model, now, now);

  return { id, workspaceId, title, provider, model, createdAt: now, updatedAt: now };
}

export function updateConversationTitle(conversationId: string, title: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
    title,
    now,
    conversationId
  );
}

export function deleteConversation(conversationId: string): void {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
}

export function getMessages(conversationId: string): Message[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at')
    .all(conversationId) as Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as 'user' | 'assistant' | 'system',
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Message {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, conversationId, role, content, now);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);

  return { id, conversationId, role, content, createdAt: now };
}
