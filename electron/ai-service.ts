import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKeys, getMessages, addMessage } from './database';

export interface ChatRequest {
  userId: string;
  conversationId: string;
  message: string;
  provider: 'openai' | 'gemini';
  model: string;
}

export interface ChatResponse {
  content: string;
  messageId: string;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const keys = getApiKeys(req.userId);

  addMessage(req.conversationId, 'user', req.message);

  const history = getMessages(req.conversationId);
  const chatHistory = history.filter((m) => m.role !== 'system');

  let responseContent: string;

  if (req.provider === 'openai') {
    if (!keys.openaiKey) {
      throw new Error('OpenAI API key not configured. Add it in Settings.');
    }
    responseContent = await chatOpenAI(keys.openaiKey, req.model, chatHistory);
  } else {
    if (!keys.geminiKey) {
      throw new Error('Gemini API key not configured. Add it in Settings.');
    }
    responseContent = await chatGemini(keys.geminiKey, req.model, chatHistory);
  }

  const saved = addMessage(req.conversationId, 'assistant', responseContent);
  return { content: responseContent, messageId: saved.id };
}

async function chatOpenAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  });

  return response.choices[0]?.message?.content ?? 'No response received.';
}

async function chatGemini(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = geminiModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

export async function testOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}

export async function testGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    await model.generateContent('Hi');
    return true;
  } catch {
    return false;
  }
}

export const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o1-mini',
];

export const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];
