import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_CHAT_MODEL } from './config';
import { chatGitHubCopilot, type SimpleHistoryMessage } from './github-copilot';

export type MergedEngineKeys = {
  openaiKey: string | null;
  geminiKey: string | null;
  githubKey: string | null;
};

type EngineDraft = { engine: string; content: string };

const SYNTHESIS_INSTRUCTION = `You are Almahy AI — one unified assistant from Al Thakeel.
You received multiple internal expert drafts for the same user question.
Write ONE final answer that:
- Keeps only accurate, consistent facts (drop contradictions)
- Prefers details that multiple drafts agree on
- Sounds natural, warm, and clear — as Almahy AI only
- NEVER mention ChatGPT, Gemini, Copilot, GitHub, OpenAI, Google, drafts, or multiple engines
- NEVER say you combined answers from other AIs`;

export function countChatEngines(keys: MergedEngineKeys, hasImageMedia: boolean): number {
  let n = 0;
  if (keys.geminiKey) n += 1;
  if (keys.openaiKey) n += 1;
  if (keys.githubKey && !hasImageMedia) n += 1;
  return n;
}

export function shouldMergeEngines(keys: MergedEngineKeys, hasImageMedia: boolean): boolean {
  return countChatEngines(keys, hasImageMedia) >= 2;
}

export async function chatWithMergedEngines(
  keys: MergedEngineKeys,
  history: SimpleHistoryMessage[],
  searchContext: string,
  modeInstruction: string,
  userQuestion: string,
  runners: {
    chatGemini: () => Promise<string>;
    chatOpenAI: () => Promise<string>;
  },
  hasImageMedia: boolean
): Promise<string> {
  const tasks: Array<Promise<EngineDraft | null>> = [];

  if (keys.geminiKey) {
    tasks.push(
      runners
        .chatGemini()
        .then((content) => ({ engine: 'gemini', content }))
        .catch(() => null)
    );
  }

  if (keys.openaiKey) {
    tasks.push(
      runners
        .chatOpenAI()
        .then((content) => ({ engine: 'chatgpt', content }))
        .catch(() => null)
    );
  }

  if (keys.githubKey && !hasImageMedia) {
    tasks.push(
      chatGitHubCopilot(keys.githubKey, history, modeInstruction, searchContext)
        .then((content) => ({ engine: 'copilot', content }))
        .catch(() => null)
    );
  }

  const drafts = (await Promise.all(tasks)).filter(
    (d): d is EngineDraft => !!d?.content?.trim()
  );

  if (drafts.length === 0) {
    throw new Error('All AI engines failed. Check API keys in Engine Settings.');
  }

  if (drafts.length === 1) {
    return drafts[0].content;
  }

  return synthesizeDrafts(keys, userQuestion, modeInstruction, drafts);
}

async function synthesizeDrafts(
  keys: MergedEngineKeys,
  userQuestion: string,
  modeInstruction: string,
  drafts: EngineDraft[]
): Promise<string> {
  const bundle = drafts
    .map((d, i) => `--- Expert view ${i + 1} ---\n${d.content.slice(0, 6000)}`)
    .join('\n\n');

  const prompt = `${SYNTHESIS_INSTRUCTION}\n\n${modeInstruction}\n\nUser question:\n${userQuestion}\n\n${bundle}`;

  if (keys.geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: keys.geminiKey });
      const response = await ai.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: prompt,
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch {
      // fall through
    }
  }

  if (keys.openaiKey) {
    const client = new OpenAI({ apiKey: keys.openaiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYNTHESIS_INSTRUCTION },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text) return text;
  }

  return pickLongestDraft(drafts);
}

function pickLongestDraft(drafts: EngineDraft[]): string {
  return drafts.reduce((best, cur) => (cur.content.length > best.content.length ? cur : best)).content;
}
