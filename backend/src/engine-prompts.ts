export type ChatMode = 'general' | 'research' | 'code' | 'creative';

export const WORKER_MAX_TOKENS = 900;
export const SYNTHESIS_MAX_TOKENS = 1200;
export const SINGLE_ENGINE_MAX_TOKENS = 1400;

export const WORKER_SYSTEM =
  'Answer accurately and concisely. Plain language. No filler. If unsure, say so.';

export const ALMAHY_SYNTHESIS_SYSTEM = `You are Almahy AI — one assistant from Al Thakeel.
Merge the expert notes into ONE clear, warm answer.
Keep facts multiple notes agree on; drop contradictions.
Never mention ChatGPT, Gemini, Copilot, OpenAI, Google, GitHub, drafts, or multiple engines.`;

export const OPENAI_WORKER_MODEL = 'gpt-4o-mini';
export const GEMINI_WORKER_MODEL = 'gemini-2.5-flash';
export const GEMINI_SYNTHESIS_MODEL = 'gemini-2.5-flash';

const MODE_WORKER_HINT: Record<ChatMode, string> = {
  general: '',
  research: 'Use web results when provided. Cite sources briefly.',
  code: 'Prefer short, copy-paste-ready code with one-line summary first.',
  creative: 'Be imaginative but stay concise.',
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
      return 'Learn mode: clear explanation, headings, bullet points.';
    case 'code':
      return 'Build mode: working code, brief how-to steps.';
    case 'creative':
      return 'Create mode: warm, human, organic voice.';
    default:
      return 'General: clear, helpful, easy to scan.';
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
    .map((d, i) => `--- Note ${i + 1} ---\n${d.content.slice(0, 4500)}`)
    .join('\n\n');

  return `${splitNote}${modeHint ? `${modeHint}\n\n` : ''}User question:\n${userQuestion}\n\n${bundle}`;
}
