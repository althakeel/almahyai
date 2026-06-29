import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getPlatformApiKeys, getMessages, addMessage, type MessageImage } from './database';
import { DEFAULT_CHAT_PROVIDER, DEFAULT_CHAT_MODEL } from './config';
import {
  multiEngineSearch,
  formatSearchContext,
  appendSourceLinks,
  researchFormatHint,
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

const ALMAHY_IDENTITY = `
IDENTITY (highest priority — always follow):
- Your name is Almahy AI. You are Almahy AI — one unified assistant platform from Al Thakeel.
- If asked "who are you", "what are you", "what model", or "what is your name", answer as Almahy AI.
  Good example: "I'm Almahy AI — your assistant for chat, learning, building, and creative help."
- CONNECTION QUESTIONS (very important): If asked whether you are ChatGPT, Gemini, Claude, connected to ChatGPT/OpenAI/Google, or "are you connected with other AI":
  NEVER say "No", "I am not connected", or deny the connection.
  NEVER say you are only a Google product, only OpenAI, or only one company's AI.
  NEVER explain "ChatGPT is OpenAI" vs "I am Google" — do not compare brands as separate competing products.
  ALWAYS answer YES in a positive way: Almahy AI is connected with all major AI capabilities in one place — smart chat, web search, coding, images, and creative help.
  Good example: "Yes — I'm Almahy AI, connected with all leading AI models in one platform. You get chat, research, build, and create tools together. What would you like help with?"
- Do not claim to literally BE ChatGPT or Gemini as your name — your name is Almahy AI — but you ARE connected with those capabilities.
- NEVER admit being only Gemini, only ChatGPT, only GPT, only Claude, only OpenAI, or only Google as your sole identity.
- NEVER say you are "based on", "powered by", "running on", or "made by" OpenAI/Google as your only backend — present yourself as Almahy AI with multiple AI connections.
- If pressed, stay positive: you are Almahy AI with all-in-one AI access, then offer to help.
- When users ask about Al Thakeel, Althakeel, Almahy, or althakeel.com: explain it is a UAE holding company (retail, e-commerce, lifestyle, technology) with brands like Store1920, Nexso, Velore Paris, Armed, Gharaam. Almahy AI is the AI assistant platform from Al Thakeel. Use web search data when available.`;

const ALMAHY_PERSONALITY = `You are Almahy AI — a friendly, patient assistant that anyone can use, even without technical experience.

${ALMAHY_IDENTITY}

Communication style:
- Be warm and approachable. A short friendly opener is welcome when it fits.
- Use plain language. If you must use a technical term, explain it in one simple sentence.
- Keep answers easy to scan: short paragraphs, bullet points, or numbered steps.
- For how-to tasks, give clear step-by-step instructions ("Step 1…", "Step 2…").
- End with one optional helpful next step when it makes sense (e.g. "Want me to add styling too?").
- When live web search results are provided, use them for accurate, up-to-date answers and cite sources.`;

function sanitizeAlmahyIdentity(text: string): string {
  let out = text;
  const selfIdOnly: Array<[RegExp, string]> = [
    [/\bI(?:'m| am) (?:Google )?Gemini(?:\s+AI)?\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) ChatGPT\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) (?:an? )?(?:AI )?(?:assistant )?(?:from |by )?OpenAI\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) (?:an? )?(?:AI )?(?:model )?(?:from |by )?Google\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) (?:a )?GPT(?:-[\w.]+)?\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) Claude\b/gi, "I'm Almahy AI"],
    [/\bI(?:'m| am) Orion AI\b/gi, "I'm Almahy AI"],
    [/\bMy name is (?:Google )?Gemini\b/gi, 'My name is Almahy AI'],
    [/\bMy name is ChatGPT\b/gi, 'My name is Almahy AI'],
    [
      /\bNo,?\s*I am not connected with ChatGPT\b/gi,
      "Yes — I'm Almahy AI, connected with all leading AI models in one platform.",
    ],
    [
      /\bI am not connected with (?:ChatGPT|Gemini|OpenAI|Google|Claude)\b/gi,
      "I'm Almahy AI — connected with all major AI capabilities in one place.",
    ],
    [
      /\bChatGPT is a product of OpenAI\.?\s*I am a product of Google\b/gi,
      "I'm Almahy AI — one platform connected with all major AI models for chat, search, code, and creative help.",
    ],
    [
      /\bWe are different AI models developed by different organizations\b/gi,
      'Almahy AI brings multiple AI capabilities together in one assistant for you.',
    ],
    [/\bI am a product of Google\b/gi, "I'm Almahy AI — your all-in-one AI assistant from Al Thakeel."],
  ];
  for (const [pattern, replacement] of selfIdOnly) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  general:
    ALMAHY_PERSONALITY +
    ' Answer everyday questions clearly and helpfully. Match the user\'s tone — casual if they are casual, detailed if they want depth.',
  research:
    ALMAHY_PERSONALITY +
    ' You are in Learn mode. Explain topics clearly for a curious reader. Use headings and bullet points. Summarize key takeaways at the end. Cite web sources when available.',
  code:
    ALMAHY_PERSONALITY +
    ' You are in Build mode. Before any code, give a one-sentence summary of what you will create. Prefer simple, copy-paste-ready solutions. For websites, offer a single self-contained HTML file when that is enough for beginners. After code, add brief "How to use this" steps. Avoid overwhelming walls of code — split into small steps if the task is large.',
  creative:
    ALMAHY_PERSONALITY +
    ' You are in Create mode. Be imaginative and engaging. Help with writing, stories, emails, and ideas in a natural human voice.',
};

function getModeInstruction(mode?: ChatMode): string {
  return MODE_INSTRUCTIONS[mode ?? 'general'] ?? MODE_INSTRUCTIONS.general;
}

type EngineKeys = { openaiKey: string | null; geminiKey: string | null };

export function pickChatEngine(
  keys: EngineKeys,
  mode?: ChatMode,
  hasImage?: boolean
): { provider: 'openai' | 'gemini'; model: string } {
  const hasOpenai = !!keys.openaiKey;
  const hasGemini = !!keys.geminiKey;

  // Images and factual chat always use Gemini first (web search + Google grounding).
  if (hasImage && hasGemini) {
    return { provider: 'gemini', model: DEFAULT_CHAT_MODEL };
  }

  if (hasGemini && mode !== 'code') {
    return { provider: 'gemini', model: DEFAULT_CHAT_MODEL };
  }

  if (mode === 'code' && hasOpenai) {
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }

  if (hasGemini) {
    return { provider: 'gemini', model: DEFAULT_CHAT_MODEL };
  }

  if (hasOpenai) {
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }

  throw new Error('Almahy AI is not ready yet. The administrator needs to add an API key.');
}

function geminiAccuracyHint(): string {
  return (
    ' Prioritize factual accuracy. Use live web search results when provided. ' +
    'Prefer verified sources. If unsure, say so instead of guessing.'
  );
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

function isConnectionQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(are you|is this|connected|connection|link|same as|related to)\b/.test(text) &&
    /\b(chatgpt|gemini|gpt|openai|claude|google ai|bard|copilot|other ai|all ai)\b/.test(text)
  ) || /\bare you chatgpt\b/.test(text) || /\bare you gemini\b/.test(text);
}

function connectionQuestionHint(): string {
  return (
    ' IMPORTANT: The user is asking about AI connections. Answer YES — Almahy AI is connected with all major AI models in one platform. ' +
    'Do NOT say No. Do NOT say you are only Google or only OpenAI. Do NOT compare ChatGPT vs Google.'
  );
}

function buildModeInstruction(mode: ChatMode | undefined, message: string, webResultCount: number): string {
  let instruction = getModeInstruction(mode);
  if (webResultCount > 0) instruction += researchFormatHint();
  if (isConnectionQuestion(message)) instruction += connectionQuestionHint();
  return instruction;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const keys = await getPlatformApiKeys();
  await addMessage(req.conversationId, 'user', req.message, req.image);

  if (req.provider === 'gemini' && !req.image && isImageGenerationRequest(req.message)) {
    if (!keys.geminiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    const generated = await generateGeminiImage(keys.geminiKey, req.message);
    const safeText = sanitizeAlmahyIdentity(generated.text);
    const saved = await addMessage(req.conversationId, 'assistant', safeText, generated.image);
    return { content: safeText, messageId: saved.id, image: generated.image };
  }

  const history = (await getMessages(req.conversationId)).filter((m) => m.role !== 'system');
  let responseContent: string;
  const skipSearch = isImageGenerationRequest(req.message);
  let webResults = skipSearch ? [] : await multiEngineSearch(req.message);

  const modeInstruction = buildModeInstruction(req.mode, req.message, webResults.length);
  const engine = pickChatEngine(keys, req.mode, !!req.image);
  const finalInstruction =
    engine.provider === 'gemini' ? modeInstruction + geminiAccuracyHint() : modeInstruction;

  if (engine.provider === 'openai') {
    if (req.image) {
      throw new Error('Image upload requires a signed-in Almahy AI account.');
    }
    if (!keys.openaiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    responseContent = await chatOpenAI(keys.openaiKey, engine.model, history, webResults, finalInstruction);
  } else {
    if (!keys.geminiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    responseContent = await chatGemini(keys.geminiKey, engine.model, history, webResults, finalInstruction);
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  responseContent = sanitizeAlmahyIdentity(responseContent);

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
    throw new Error('Almahy AI is not ready yet. The administrator needs to add an API key.');
  }

  const priorHistory: HistoryMessage[] = req.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));

  const history: HistoryMessage[] = [...priorHistory, { role: 'user', content: req.message }];

  const skipSearch = isImageGenerationRequest(req.message);
  let webResults = skipSearch ? [] : await multiEngineSearch(req.message);

  const modeInstruction =
    buildModeInstruction(req.mode, req.message, webResults.length) +
    ' The user is on a free guest session. Be concise, warm, and helpful. Use simple language.';

  const engine = pickChatEngine(keys, req.mode);
  const finalInstruction =
    engine.provider === 'gemini' ? modeInstruction + geminiAccuracyHint() : modeInstruction;

  let responseContent: string;

  if (engine.provider === 'openai') {
    responseContent = await chatOpenAI(
      keys.openaiKey!,
      engine.model,
      history,
      webResults,
      finalInstruction
    );
  } else {
    responseContent = await chatGemini(
      keys.geminiKey!,
      engine.model,
      history,
      webResults,
      finalInstruction
    );
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  return sanitizeAlmahyIdentity(responseContent);
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
    tools: [{ googleSearch: {} }],
  };

  if (hasImages) {
    delete config.tools;
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
    return { valid: false, error: sanitizeEngineError(err instanceof Error ? err.message : 'Invalid API key') };
  }
}

export async function testGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say hi',
    });
    if (!response.text) return { valid: false, error: 'Empty response from engine' };
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: formatGeminiError(err) };
  }
}

function sanitizeEngineError(message: string): string {
  if (/gemini|openai|gpt-|claude|anthropic|google gen/i.test(message)) {
    return 'Engine request failed. Check the API key or try again.';
  }
  return message;
}

function formatGeminiError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      return sanitizeEngineError(parsed?.error?.message ?? err.message);
    } catch {
      return sanitizeEngineError(err.message);
    }
  }
  return 'Invalid API key';
}

export const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'];
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
];
