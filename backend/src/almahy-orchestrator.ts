import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import {
  ALMAHY_SYNTHESIS_SYSTEM,
  GEMINI_SYNTHESIS_MODEL,
  OPENAI_SYNTHESIS_MODEL,
  SYNTHESIS_MAX_TOKENS,
  buildSynthesisUserPrompt,
  splitUserRequest,
} from './engine-prompts';
import type { MergedEngineKeys } from './multi-engine-chat';

type EngineDraft = { engine: string; content: string };

export function orchestratorSplitSummary(message: string): string {
  const parts = splitUserRequest(message);
  if (parts.length <= 1) return message;
  return parts.map((part, i) => `Part ${i + 1}: ${part}`).join(' | ');
}

export async function synthesizeAsAlmahy(
  keys: MergedEngineKeys,
  userQuestion: string,
  modeHint: string,
  drafts: EngineDraft[]
): Promise<string> {
  if (drafts.length === 0) {
    throw new Error('All AI engines failed. Check API keys in Engine Settings.');
  }

  const prompt = buildSynthesisUserPrompt(userQuestion, modeHint, drafts);

  if (keys.geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: keys.geminiKey });
      const response = await ai.models.generateContent({
        model: GEMINI_SYNTHESIS_MODEL,
        contents: prompt,
        config: {
          systemInstruction: ALMAHY_SYNTHESIS_SYSTEM,
          maxOutputTokens: SYNTHESIS_MAX_TOKENS,
          temperature: 0.35,
        },
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
      model: OPENAI_SYNTHESIS_MODEL,
      temperature: 0.35,
      max_tokens: SYNTHESIS_MAX_TOKENS,
      messages: [
        { role: 'system', content: ALMAHY_SYNTHESIS_SYSTEM },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text) return text;
  }

  return pickBestDraft(drafts);
}

function pickBestDraft(drafts: EngineDraft[]): string {
  return drafts.reduce((best, cur) => (cur.content.length > best.content.length ? cur : best)).content;
}
