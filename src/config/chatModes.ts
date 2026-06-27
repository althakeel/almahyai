export type ChatMode = 'general' | 'research' | 'code' | 'creative';

export interface ChatModeConfig {
  id: ChatMode;
  label: string;
  icon: string;
  description: string;
  hint: string;
}

export const CHAT_MODES: ChatModeConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: '💬',
    description: 'Everyday questions and tasks',
    hint: 'Balanced answers for any topic',
  },
  {
    id: 'research',
    label: 'Research',
    icon: '🔍',
    description: 'Deep analysis with web sources',
    hint: 'Live search · citations · structured reports',
  },
  {
    id: 'code',
    label: 'Code',
    icon: '⌨️',
    description: 'Programming and debugging',
    hint: 'Clean code blocks · explanations · fixes',
  },
  {
    id: 'creative',
    label: 'Creative',
    icon: '✨',
    description: 'Writing, stories, and ideas',
    hint: 'Imaginative · vivid · engaging prose',
  },
];

export interface QuickPrompt {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  mode: ChatMode;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'summarize',
    title: 'Summarize',
    icon: '📋',
    mode: 'general',
    prompt: 'Summarize the following in clear bullet points:',
  },
  {
    id: 'research',
    title: 'Research topic',
    icon: '🌐',
    mode: 'research',
    prompt: 'Research and explain the latest developments on:',
  },
  {
    id: 'code',
    title: 'Write code',
    icon: '💻',
    mode: 'code',
    prompt: 'Write production-ready code with comments for:',
  },
  {
    id: 'email',
    title: 'Draft email',
    icon: '✉️',
    mode: 'creative',
    prompt: 'Write a professional email about:',
  },
  {
    id: 'translate',
    title: 'Translate',
    icon: '🌍',
    mode: 'general',
    prompt: 'Translate to English (or specify language):',
  },
  {
    id: 'image',
    title: 'Generate image',
    icon: '🎨',
    mode: 'creative',
    prompt: 'Generate an image of',
  },
];

export const GUEST_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'explain',
    title: 'Explain simply',
    icon: '💡',
    mode: 'general',
    prompt: 'Explain this in simple terms:',
  },
  {
    id: 'help',
    title: 'Help me with',
    icon: '🤝',
    mode: 'general',
    prompt: 'Help me with:',
  },
  {
    id: 'code',
    title: 'Write code',
    icon: '💻',
    mode: 'code',
    prompt: 'Write clean code with comments for:',
  },
  {
    id: 'email',
    title: 'Draft email',
    icon: '✉️',
    mode: 'creative',
    prompt: 'Write a short professional email about:',
  },
];

export function getModeConfig(mode: ChatMode): ChatModeConfig {
  return CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];
}
