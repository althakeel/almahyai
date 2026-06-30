import type { MessageAttachment, MessageImage } from './database';

const GITHUB_MODELS_URL =
  process.env.GITHUB_MODELS_URL ?? 'https://models.inference.ai.azure.com/chat/completions';
const GITHUB_CHAT_MODEL = process.env.GITHUB_CHAT_MODEL ?? 'gpt-4o-mini';

export type SimpleHistoryMessage = {
  role: string;
  content: string;
  image?: MessageImage | null;
  attachment?: MessageAttachment | null;
};

function messageText(message: SimpleHistoryMessage): string {
  let content = message.content.trim();
  if (!content && message.attachment?.extractedText) {
    content = message.attachment.extractedText;
  }
  if (!content && message.image) {
    content = 'User attached an image.';
  }
  return content || 'Hello';
}

export async function testGitHubCopilotKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(GITHUB_MODELS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GITHUB_CHAT_MODEL,
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        max_tokens: 8,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      return { valid: false, error: detail || `GitHub Models error (${response.status})` };
    }
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid GitHub token' };
  }
}

export async function chatGitHubCopilot(
  apiKey: string,
  messages: SimpleHistoryMessage[],
  systemInstruction: string,
  searchContext: string
): Promise<string> {
  const mapped = messages.map((m, index) => {
    let content = messageText(m);
    if (searchContext && index === messages.length - 1 && m.role === 'user') {
      content = `${searchContext}\n\nUser question:\n${content}`;
    }
    return {
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content,
    };
  });

  const response = await fetch(GITHUB_MODELS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GITHUB_CHAT_MODEL,
      messages: [{ role: 'system', content: systemInstruction }, ...mapped],
      temperature: 0.55,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(detail || `GitHub Copilot Models error (${response.status})`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || 'No response received.';
}
