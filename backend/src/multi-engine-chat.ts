import { chatGitHubCopilotWorker } from './github-copilot';
import { synthesizeAsAlmahy } from './almahy-orchestrator';
import {
  buildLeanWorkerQuestion,
  buildWorkerSystem,
} from './engine-prompts';

export type MergedEngineKeys = {
  openaiKey: string | null;
  geminiKey: string | null;
  githubKey: string | null;
};

type EngineDraft = { engine: string; content: string };

type LeanHistoryMessage = {
  role: string;
  content: string;
  attachment?: { extractedText?: string } | null;
};

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
  history: LeanHistoryMessage[],
  searchContext: string,
  workerSystem: string,
  synthesisHint: string,
  userQuestion: string,
  runners: {
    chatGemini: (question: string) => Promise<string>;
    chatOpenAI: (question: string) => Promise<string>;
  },
  hasImageMedia: boolean,
  workerMaxTokens: number
): Promise<string> {
  const fileExtract =
    history.length > 0 && history[history.length - 1]?.role === 'user'
      ? history[history.length - 1].attachment?.extractedText
      : undefined;

  const leanQuestion = buildLeanWorkerQuestion(userQuestion, history, searchContext, fileExtract);

  const tasks: Array<Promise<EngineDraft | null>> = [];

  if (keys.geminiKey) {
    tasks.push(
      runners
        .chatGemini(leanQuestion)
        .then((content) => ({ engine: 'gemini', content }))
        .catch(() => null)
    );
  }

  if (keys.openaiKey) {
    tasks.push(
      runners
        .chatOpenAI(leanQuestion)
        .then((content) => ({ engine: 'chatgpt', content }))
        .catch(() => null)
    );
  }

  if (keys.githubKey && !hasImageMedia) {
    tasks.push(
      chatGitHubCopilotWorker(keys.githubKey, leanQuestion, workerSystem, workerMaxTokens)
        .then((content) => ({ engine: 'copilot', content }))
        .catch(() => null)
    );
  }

  const drafts = (await Promise.all(tasks)).filter(
    (d): d is EngineDraft => !!d?.content?.trim()
  );

  return synthesizeAsAlmahy(keys, userQuestion, synthesisHint, drafts);
}

export { buildWorkerSystem };
