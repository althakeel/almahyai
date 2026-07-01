export type ChatMode = 'general' | 'research' | 'code' | 'creative';

export const WORKER_MAX_TOKENS = 1400;
export const WORKER_MERGE_MAX_TOKENS = 1600;
export const SYNTHESIS_MAX_TOKENS = 2000;
export const SINGLE_ENGINE_MAX_TOKENS = 1800;

export const WORKER_SYSTEM =
  'Give a complete, accurate answer. Cover every part of the question. Plain language, well structured. ' +
  'For addresses, phone numbers, and links: use ONLY verified facts or web search results provided — never guess. ' +
  'If unsure, say so — do not invent locations or URLs.';

export const ALMAHY_SYNTHESIS_SYSTEM = `You are Almahy AI — one assistant from Al Thakeel, developed and trained by Rohith.
You received expert notes from parallel analysis. Write ONE final answer for the user.
Rules:
- Complete and proper: answer the full question; do not skip parts.
- Accuracy first: keep facts that multiple notes agree on; drop clear contradictions. Never invent addresses, phone numbers, or map links.
- Well formatted: short paragraphs, bullets, or steps when helpful.
- Warm, clear, professional — speak only as Almahy AI.
- Never mention ChatGPT, Gemini, Copilot, OpenAI, Google, GitHub, drafts, engines, or third-party AI brands.
- Whoever asks — same quality: helpful, respectful, complete.`;

export const OPENAI_WORKER_MODEL = 'gpt-4o-mini';
export const OPENAI_SYNTHESIS_MODEL = 'gpt-4o-mini';
export const GEMINI_WORKER_MODEL = 'gemini-2.5-flash';
export const GEMINI_SYNTHESIS_MODEL = 'gemini-2.5-flash';

const MODE_WORKER_HINT: Record<ChatMode, string> = {
  general: 'Be thorough and helpful.',
  research: 'Use web results when provided. Cite sources. Include key takeaways.',
  code: 'Working copy-paste code first, then brief how-to steps.',
  creative: 'Imaginative but complete — natural human voice.',
};

export function pickWorkerModel(mode?: ChatMode): {
  openai: string;
  gemini: string;
  github: string;
} {
  if (mode === 'code') {
    return { openai: OPENAI_WORKER_MODEL, gemini: GEMINI_WORKER_MODEL, github: OPENAI_WORKER_MODEL };
  }
  return { openai: OPENAI_WORKER_MODEL, gemini: GEMINI_WORKER_MODEL, github: OPENAI_WORKER_MODEL };
}

export function buildSynthesisModeHint(mode?: ChatMode): string {
  switch (mode ?? 'general') {
    case 'research':
      return 'Learn mode: full clear explanation, headings, bullet points, key takeaways.';
    case 'code':
      return 'Build mode: complete working code, then brief usage steps.';
    case 'creative':
      return 'Create mode: warm, human, organic voice — complete the request.';
    default:
      return 'General: clear, complete, helpful — easy to scan.';
  }
}

export function buildWorkerSystem(mode?: ChatMode): string {
  const hint = MODE_WORKER_HINT[mode ?? 'general'];
  return hint ? `${WORKER_SYSTEM} ${hint}` : WORKER_SYSTEM;
}

type LeanHistoryMessage = {
  role: string;
  content: string;
};

export function splitUserRequest(message: string): string[] {
  const text = message.trim();
  if (!text) return [''];

  const numbered = text.split(/\n(?=\s*\d+[.)]\s+)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 2) return numbered;

  const questions = text
    .split(/(?<=[?？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (questions.length >= 2) return questions;

  const andParts = text
    .split(/\s+(?:and also|also,?|plus,?)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (andParts.length >= 2 && text.length > 80) return andParts;

  return [text];
}

function needsPriorContext(message: string, history: LeanHistoryMessage[]): boolean {
  if (history.length < 2) return false;
  return /\b(it|that|this|those|above|previous|same|again|continue|what about|you said|earlier|the last|more detail)\b/i.test(
    message
  );
}

function extractLastExchange(history: LeanHistoryMessage[]): string {
  const tail = history.slice(-4);
  return tail
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 350)}`)
    .join('\n')
    .slice(0, 900);
}

export function buildLeanWorkerQuestion(
  userQuestion: string,
  history: LeanHistoryMessage[],
  searchContext: string,
  fileExtract?: string
): string {
  const splits = splitUserRequest(userQuestion);
  let question =
    splits.length > 1
      ? `Answer every part:\n${splits.map((part, i) => `${i + 1}. ${part}`).join('\n')}`
      : userQuestion;

  if (fileExtract?.trim()) {
    question = `${question}\n\n=== FILE ===\n${fileExtract.slice(0, 12000)}`;
  }

  if (needsPriorContext(userQuestion, history)) {
    question = `Context (last turns only):\n${extractLastExchange(history)}\n\nCurrent:\n${question}`;
  }

  if (searchContext.trim()) {
    question = `${searchContext.trim()}\n\nQuestion:\n${question}`;
  }

  return question;
}

export function buildSynthesisUserPrompt(
  userQuestion: string,
  modeHint: string,
  drafts: Array<{ engine: string; content: string }>
): string {
  const splits = splitUserRequest(userQuestion);
  const splitNote =
    splits.length > 1
      ? `Almahy split this into ${splits.length} parts before asking experts.\n`
      : '';

  const bundle = drafts
    .map((d, i) => `--- Expert ${i + 1} ---\n${d.content.slice(0, 5500)}`)
    .join('\n\n');

  return `${splitNote}${modeHint ? `${modeHint}\n` : ''}Merge into ONE proper answer for the user. Do not leave any part unanswered.\n\nUser question:\n${userQuestion}\n\n${bundle}`;
}
