export type ChatMode = 'general' | 'research' | 'code' | 'creative';

export interface ChatModeConfig {
  id: ChatMode;
  label: string;
  icon: string;
  description: string;
  hint: string;
  placeholder: string;
}

export const CHAT_MODES: ChatModeConfig[] = [
  {
    id: 'general',
    label: 'Chat',
    icon: '💬',
    description: 'Everyday questions',
    hint: 'Ask me anything — natural, clear answers',
    placeholder: 'Ask me anything…',
  },
  {
    id: 'research',
    label: 'Learn',
    icon: '📚',
    description: 'Explain & research',
    hint: 'I\'ll explain topics clearly and find useful sources',
    placeholder: 'What would you like to learn about?',
  },
  {
    id: 'code',
    label: 'Build',
    icon: '🛠',
    description: 'Websites & code',
    hint: 'Step-by-step help to build websites, apps, and scripts',
    placeholder: 'Describe what you want to build…',
  },
  {
    id: 'creative',
    label: 'Create',
    icon: '✨',
    description: 'Writing & ideas',
    hint: 'Natural, human-sounding writing and realistic ideas',
    placeholder: 'What should we create together?',
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
    id: 'help',
    title: 'Help me with…',
    icon: '🤝',
    mode: 'general',
    prompt: 'Help me with:',
  },
  {
    id: 'explain',
    title: 'Explain simply',
    icon: '💡',
    mode: 'general',
    prompt: 'Explain this in simple terms:',
  },
  {
    id: 'webpage',
    title: 'Build a webpage',
    icon: '🌐',
    mode: 'code',
    prompt: 'Build a simple webpage for:',
  },
  {
    id: 'email',
    title: 'Write an email',
    icon: '✉️',
    mode: 'creative',
    prompt: 'Write a friendly email about:',
  },
  {
    id: 'learn',
    title: 'Teach me about',
    icon: '📖',
    mode: 'research',
    prompt: 'Teach me about:',
  },
  {
    id: 'create-pdf',
    title: 'Create a PDF',
    icon: '📄',
    mode: 'creative',
    prompt: 'Write a professional PDF document about:',
  },
  {
    id: 'edit-pdf',
    title: 'Edit my PDF',
    icon: '✏️',
    mode: 'creative',
    prompt: 'I will attach a PDF. Please read it and rewrite it with these changes:',
  },
  {
    id: 'create-excel',
    title: 'Create a spreadsheet',
    icon: '📊',
    mode: 'creative',
    prompt: 'Create a spreadsheet with columns and sample rows about:',
  },
  {
    id: 'edit-excel',
    title: 'Edit my Excel',
    icon: '📈',
    mode: 'creative',
    prompt: 'I will attach an Excel file. Please read it and update the spreadsheet with these changes:',
  },
  {
    id: 'image',
    title: 'Create an image',
    icon: '🎨',
    mode: 'creative',
    prompt: 'Create an image of',
  },
];

export const GUEST_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'help',
    title: 'Help me with…',
    icon: '🤝',
    mode: 'general',
    prompt: 'Help me with:',
  },
  {
    id: 'explain',
    title: 'Explain simply',
    icon: '💡',
    mode: 'general',
    prompt: 'Explain this in simple terms:',
  },
  {
    id: 'webpage',
    title: 'Build a webpage',
    icon: '🌐',
    mode: 'code',
    prompt: 'Build a simple webpage for:',
  },
  {
    id: 'email',
    title: 'Write an email',
    icon: '✉️',
    mode: 'creative',
    prompt: 'Write a short email about:',
  },
];

export function getModeConfig(mode: ChatMode): ChatModeConfig {
  return CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];
}
