import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getPlatformApiKeys, getMessages, addMessage, type MessageImage } from './database';
import { DEFAULT_CHAT_PROVIDER, DEFAULT_CHAT_MODEL } from './config';
import {
  shouldUseWebSearch,
  multiEngineSearch,
  formatSearchContext,
  appendSourceLinks,
} from './web-search';

export interface ChatRequest {
  userId: string;
  conversationId: string;
  message: string;
  provider: 'openai' | 'gemini';
  model: string;
  image?: MessageImage | null;
  mode?: ChatMode;
}

export type ChatMode = 'general' | 'research' | 'code' | 'creative';

const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  general: 'You are Orion AI, an advanced intelligent assistant. Be helpful, accurate, and clear.',
  research:
    'You are Orion AI in Research Mode. Provide thorough, well-structured answers with facts and sources. Use bullet points and headers. Cite web sources when available. Be analytical and precise.',
  code:
    'You are Orion AI in Code Mode. Write clean, production-ready code with comments. Always use markdown code blocks with language tags. Explain logic briefly. Fix bugs and suggest best practices.',
  creative:
    'You are Orion AI in Creative Mode. Be imaginative, vivid, and engaging. Use storytelling, rich language, and creative structure.',
};

function getModeInstruction(mode?: ChatMode): string {
  return MODE_INSTRUCTIONS[mode ?? 'general'] ?? MODE_INSTRUCTIONS.general;
}

type HistoryMessage = {
  role: string;
  content: string;
  image?: MessageImage | null;
};

export interface ChatResponse {
  content: string;
  messageId: string;
  image?: MessageImage | null;
}

function isImageGenerationRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  const hasAction = /\b(generate|create|draw|make|design|paint|render|produce)\b/.test(text);
  const hasSubject = /\b(image|picture|photo|illustration|logo|artwork|drawing|portrait|poster|icon|banner)\b/.test(text);
  const startsWithDraw = /^draw\b/.test(text);
  const imageOf = /\b(image|picture|photo) of\b/.test(text);

  return (hasAction && hasSubject) || startsWithDraw || imageOf;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const keys = await getPlatformApiKeys();
  await addMessage(req.conversationId, 'user', req.message, req.image);

  if (req.provider === 'gemini' && !req.image && isImageGenerationRequest(req.message)) {
    if (!keys.geminiKey) {
      throw new Error('Orion AI is not ready yet. The administrator needs to add a Gemini API key.');
    }
    const generated = await generateGeminiImage(keys.geminiKey, req.message);
    const saved = await addMessage(req.conversationId, 'assistant', generated.text, generated.image);
    return { content: generated.text, messageId: saved.id, image: generated.image };
  }

  const history = (await getMessages(req.conversationId)).filter((m) => m.role !== 'system');
  let responseContent: string;
  let webResults =
    shouldUseWebSearch(req.message) || req.mode === 'research'
      ? await multiEngineSearch(req.message)
      : [];

  const modeInstruction = getModeInstruction(req.mode);

  if (req.provider === 'openai') {
    if (req.image) {
      throw new Error('Image messages are only supported with Gemini.');
    }
    if (!keys.openaiKey) {
      throw new Error('Orion AI is not ready yet. The administrator needs to add an OpenAI API key.');
    }
    responseContent = await chatOpenAI(keys.openaiKey, req.model, history, webResults, modeInstruction);
  } else {
    if (!keys.geminiKey) {
      throw new Error('Orion AI is not ready yet. The administrator needs to add a Gemini API key.');
    }
    responseContent = await chatGemini(keys.geminiKey, req.model, history, webResults, modeInstruction);
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  const saved = await addMessage(req.conversationId, 'assistant', responseContent);
  return { content: responseContent, messageId: saved.id };
}

export interface GuestChatRequest {
  message: string;
  history: Array<{ role: string; content: string }>;
  mode?: ChatMode;
}

export async function sendGuestChatMessage(req: GuestChatRequest): Promise<string> {
  if (isImageGenerationRequest(req.message)) {
    throw new Error('Image generation requires a signed-in account. Please sign in to continue.');
  }

  const keys = await getPlatformApiKeys();
  if (!keys.geminiKey && !keys.openaiKey) {
    throw new Error('Orion AI is not ready yet. The administrator needs to add an API key.');
  }

  const priorHistory: HistoryMessage[] = req.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));

  const history: HistoryMessage[] = [...priorHistory, { role: 'user', content: req.message }];

  let webResults =
    shouldUseWebSearch(req.message) || req.mode === 'research'
      ? await multiEngineSearch(req.message)
      : [];

  const modeInstruction =
    getModeInstruction(req.mode) +
    ' The user is on a free guest session. Be concise and helpful. Mention signing in for unlimited chat and image features when relevant.';

  let responseContent: string;

  if (DEFAULT_CHAT_PROVIDER === 'openai' && keys.openaiKey) {
    responseContent = await chatOpenAI(
      keys.openaiKey,
      DEFAULT_CHAT_MODEL,
      history,
      webResults,
      modeInstruction
    );
  } else {
    if (!keys.geminiKey) {
      throw new Error('Orion AI is not ready yet. The administrator needs to add a Gemini API key.');
    }
    responseContent = await chatGemini(
      keys.geminiKey,
      DEFAULT_CHAT_MODEL,
      history,
      webResults,
      modeInstruction
    );
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  return responseContent;
}

async function generateGeminiImage(
  apiKey: string,
  prompt: string
): Promise<{ text: string; image: MessageImage | null }> {
  const ai = new GoogleGenAI({ apiKey });
  const imageModels = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];

  for (const model of imageModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });

      let text = '';
      let image: MessageImage | null = null;

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) text += part.text;
        if (part.inlineData?.data) {
          image = {
            mimeType: part.inlineData.mimeType ?? 'image/png',
            data: part.inlineData.data,
          };
        }
      }

      if (image) {
        return { text: text.trim() || 'Here is your generated image.', image };
      }
    } catch {
      // try next model
    }
  }

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    });

    const bytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (bytes) {
      return {
        text: 'Here is your generated image.',
        image: { mimeType: 'image/png', data: bytes },
      };
    }
  } catch (err: unknown) {
    throw new Error(formatGeminiError(err));
  }

  throw new Error('Could not generate an image. Try a clearer prompt like "Generate an image of a sunset over mountains".');
}

async function chatOpenAI(
  apiKey: string,
  model: string,
  messages: HistoryMessage[],
  webResults: Awaited<ReturnType<typeof multiEngineSearch>>,
  modeInstruction: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const searchContext = formatSearchContext(webResults);
  const mapped = messages.map((m, index) => {
    let content = m.content;
    if (searchContext && index === messages.length - 1 && m.role === 'user') {
      content = `${searchContext}\n\nUser question:\n${m.content}`;
    }
    return {
      role: m.role as 'user' | 'assistant' | 'system',
      content,
    };
  });

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: modeInstruction }, ...mapped],
  });
  return response.choices[0]?.message?.content ?? 'No response received.';
}

function geminiParts(message: HistoryMessage) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (message.image) {
    parts.push({
      inlineData: {
        mimeType: message.image.mimeType,
        data: message.image.data,
      },
    });
  }
  if (message.content.trim()) {
    parts.push({ text: message.content });
  }
  if (parts.length === 0) {
    parts.push({ text: 'Describe this image.' });
  }
  return parts;
}

async function chatGemini(
  apiKey: string,
  model: string,
  messages: HistoryMessage[],
  webResults: Awaited<ReturnType<typeof multiEngineSearch>>,
  modeInstruction: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const searchContext = formatSearchContext(webResults);
  const hasImages = messages.some((m) => m.image);

  const contents = messages.map((m, index) => {
    const parts = geminiParts(m);
    if (searchContext && index === messages.length - 1 && m.role === 'user') {
      parts.unshift({ text: searchContext });
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const config: {
    systemInstruction?: string;
    tools?: Array<{ googleSearch: Record<string, never> }>;
  } = {
    systemInstruction: modeInstruction,
  };

  if (!hasImages) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await ai.models.generateContent({ model, contents, config });
  return response.text ?? 'No response received.';
}

export async function testOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid OpenAI key' };
  }
}

export async function testGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say hi',
    });
    if (!response.text) return { valid: false, error: 'Empty response from Gemini' };
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: formatGeminiError(err) };
  }
}

function formatGeminiError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      return parsed?.error?.message ?? err.message;
    } catch {
      return err.message;
    }
  }
  return 'Invalid Gemini key';
}

export const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'];
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
];
