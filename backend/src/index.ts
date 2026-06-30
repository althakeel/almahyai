import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  initDatabase,
  ensureFirebaseUser,
  getUserById,
  updateUserDisplayName,
  deleteUserAccount,
  savePlatformApiKeys,
  getPlatformApiKeysStatus,
  getWorkspaces,
  createWorkspace,
  getConversations,
  createConversation,
  updateConversationTitle,
  deleteConversation,
  clearConversationMessages,
  deleteAllConversations,
  getMessages,
} from './database';
import { sendChatMessage, sendGuestChatMessage, testOpenAIKey, testGeminiKey, OPENAI_MODELS, GEMINI_MODELS } from './ai-service';
import { testGitHubCopilotKey } from './github-copilot';
import { requireAuth } from './middleware/auth';
import { requireAdmin } from './middleware/admin';
import { getClientIp } from './middleware/client-ip';
import { getGuestUsage, consumeGuestRequest, GUEST_REQUEST_LIMIT } from './guest-usage';
import { isAdminEmail, DEFAULT_CHAT_PROVIDER, DEFAULT_CHAT_MODEL } from './config';

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

const PORT = Number(process.env.PORT) || 3847;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'orion-ai-backend', database: 'mongodb' });
});

app.post('/api/auth/sync', requireAuth, async (req, res) => {
  try {
    const displayName = (req.body.displayName as string) || req.authUser!.displayName;
    const user = await ensureFirebaseUser(req.authUser!.uid, req.authUser!.email, displayName);
    res.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.authUser!.uid);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, user });
});

app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const displayName = (req.body.displayName as string)?.trim();
    if (!displayName) {
      res.status(400).json({ success: false, error: 'Display name is required' });
      return;
    }
    await updateUserDisplayName(req.authUser!.uid, displayName);
    const user = await getUserById(req.authUser!.uid);
    res.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    res.status(400).json({ success: false, error: message });
  }
});

app.delete('/api/auth/account', requireAuth, async (req, res) => {
  try {
    await deleteUserAccount(req.authUser!.uid);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    res.status(400).json({ success: false, error: message });
  }
});

app.get('/api/config/chat', async (_req, res) => {
  const engines = await getPlatformApiKeysStatus();
  res.json({
    brandName: 'Almahy AI',
    engineLabel: 'Almahy Neural Engine',
    guestLimit: GUEST_REQUEST_LIMIT,
    engines: {
      gemini: engines.hasGemini,
      chatgpt: engines.hasOpenai,
      openai: engines.hasOpenai,
      copilot: engines.hasCopilot,
      github: engines.hasGithub,
    },
  });
});

app.get('/api/engines', async (_req, res) => {
  const engines = await getPlatformApiKeysStatus();
  res.json({
    success: true,
    gemini: engines.hasGemini,
    chatgpt: engines.hasOpenai,
    openai: engines.hasOpenai,
    copilot: engines.hasCopilot,
    github: engines.hasGithub,
    allConnected: engines.hasGemini && engines.hasOpenai && engines.hasGithub,
  });
});

app.get('/api/guest/limits', async (req, res) => {
  const ip = getClientIp(req);
  const usage = await getGuestUsage(ip);
  res.json({ success: true, ...usage });
});

app.post('/api/guest/chat', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const usage = await getGuestUsage(ip);

    if (usage.remaining <= 0) {
      res.status(429).json({
        success: false,
        error: `Guest limit reached (${GUEST_REQUEST_LIMIT} messages per day from your network). Sign in for unlimited access.`,
        ...usage,
      });
      return;
    }

    if (req.body.image || req.body.attachment) {
      res.status(403).json({
        success: false,
        error: 'File upload requires a signed-in account. Please sign in to attach images, PDF, or Excel files.',
      });
      return;
    }

    const message = (req.body.message as string) ?? '';
    if (!message.trim()) {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const history = (req.body.history as Array<{ role: string; content: string }>) ?? [];
    const mode = req.body.mode ?? 'general';

    const content = await sendGuestChatMessage({ message, history, mode });
    const afterUse = await consumeGuestRequest(ip);

    res.json({
      success: true,
      content,
      used: afterUse.used,
      remaining: afterUse.remaining,
      limit: afterUse.limit,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Guest chat failed';
    res.status(400).json({ success: false, error });
  }
});

app.get('/api/models', requireAuth, requireAdmin, (_req, res) => {
  res.json({ openai: OPENAI_MODELS, gemini: GEMINI_MODELS });
});

app.get('/api/keys/status', requireAuth, requireAdmin, async (_req, res) => {
  res.json(await getPlatformApiKeysStatus());
});

app.post('/api/keys', requireAuth, requireAdmin, async (req, res) => {
  const openaiKey = (req.body.openaiKey as string | null) ?? null;
  const geminiKey = (req.body.geminiKey as string | null) ?? null;
  const githubKey = (req.body.githubKey as string | null) ?? null;
  await savePlatformApiKeys({ openaiKey, geminiKey, githubKey });
  res.json({ success: true });
});

app.post('/api/keys/test/github', requireAuth, requireAdmin, async (req, res) => {
  res.json(await testGitHubCopilotKey(req.body.apiKey as string));
});

app.post('/api/keys/test/openai', requireAuth, requireAdmin, async (req, res) => {
  res.json(await testOpenAIKey(req.body.apiKey as string));
});

app.post('/api/keys/test/gemini', requireAuth, requireAdmin, async (req, res) => {
  res.json(await testGeminiKey(req.body.apiKey as string));
});

app.get('/api/workspaces', requireAuth, async (req, res) => {
  res.json(await getWorkspaces(req.authUser!.uid));
});

app.post('/api/workspaces', requireAuth, async (req, res) => {
  const name = (req.body.name as string) || 'My Workspace';
  res.json(await createWorkspace(req.authUser!.uid, name));
});

app.get('/api/workspaces/:id/conversations', requireAuth, async (req, res) => {
  res.json(await getConversations(routeParam(req.params.id)));
});

app.post('/api/workspaces/:id/conversations', requireAuth, async (req, res) => {
  const isAdmin = isAdminEmail(req.authUser!.email);
  const { title, provider, model } = req.body;
  const workspaceId = routeParam(req.params.id);
  res.json(
    await createConversation(
      workspaceId,
      title ?? 'New Chat',
      isAdmin ? (provider ?? DEFAULT_CHAT_PROVIDER) : DEFAULT_CHAT_PROVIDER,
      isAdmin ? (model ?? DEFAULT_CHAT_MODEL) : DEFAULT_CHAT_MODEL
    )
  );
});

app.patch('/api/conversations/:id', requireAuth, async (req, res) => {
  await updateConversationTitle(routeParam(req.params.id), req.body.title as string);
  res.json({ success: true });
});

app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
  await deleteConversation(routeParam(req.params.id));
  res.json({ success: true });
});

app.delete('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  await clearConversationMessages(routeParam(req.params.id));
  res.json({ success: true });
});

app.delete('/api/workspaces/:id/conversations', requireAuth, async (req, res) => {
  await deleteAllConversations(routeParam(req.params.id));
  res.json({ success: true });
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  res.json(await getMessages(routeParam(req.params.id)));
});

app.post('/api/conversations/:id/chat', requireAuth, async (req, res) => {
  try {
    const { message, image, attachment, mode } = req.body;
    const result = await sendChatMessage({
      userId: req.authUser!.uid,
      conversationId: routeParam(req.params.id),
      message: (message as string) ?? '',
      provider: 'gemini',
      model: DEFAULT_CHAT_MODEL,
      image: image ?? null,
      attachment: attachment ?? null,
      mode: mode ?? 'general',
    });
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Chat failed';
    res.status(400).json({ success: false, error });
  }
});

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Orion AI backend running on port ${PORT}`);
      console.log(`Admin email: ${process.env.ADMIN_EMAIL || 'althakeel.com@gmail.com'}`);
    });
  } catch (err) {
    console.error('Failed to start backend:', err);
    process.exit(1);
  }
}

start();
