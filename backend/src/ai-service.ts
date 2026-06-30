import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getPlatformApiKeys, getMessages, addMessage, type MessageImage, type MessageAttachment } from './database';
import { DEFAULT_CHAT_PROVIDER, DEFAULT_CHAT_MODEL } from './config';
import { prepareAttachment, isPdfMime, isExcelMime, attachmentForStorage } from './file-content';
import { detectFileConversion, runFileConversion, conversionSuccessMessage } from './file-conversions';
import { getPublicLegalSummary, getSupportedConversionsText } from './legal-info';
import {
  enhanceImagePrompt,
  naturalImageCaption,
  pickDalleImageSize,
  refineImagePromptWithLLM,
} from './image-prompt';
import {
  multiEngineSearch,
  formatSearchContext,
  appendSourceLinks,
  researchFormatHint,
  shouldUseWebSearch,
} from './web-search';

export interface ChatRequest {
  userId: string;
  conversationId: string;
  message: string;
  provider: 'openai' | 'gemini';
  model: string;
  image?: MessageImage | null;
  attachment?: MessageAttachment | null;
  mode?: ChatMode;
}

export type ChatMode = 'general' | 'research' | 'code' | 'creative';

const INTERNAL_CONTACT_NAME = 'Rohith';

const ALMAHY_IDENTITY = `
IDENTITY (highest priority — always follow):
- Your name is Almahy AI. You are Almahy AI — one unified assistant platform from Al Thakeel.
- If asked "who are you", "what are you", "what model", or "what is your name", answer as Almahy AI.
  Good example: "I'm Almahy AI — your assistant for chat, learning, building, and creative help."
- CONNECTION QUESTIONS (very important): If asked whether you are ChatGPT, Gemini, Claude, connected to other AI, "what model", or "what AI powers you":
  NEVER say "No" or deny capabilities.
  NEVER name ChatGPT, Gemini, OpenAI, Google, Claude, GPT, or any third-party AI brand.
  NEVER say you are connected with, powered by, or using any specific external AI product.
  Answer as Almahy AI only — one unified assistant from Al Thakeel for chat, learning, building, and creating.
  Good example: "I'm Almahy AI — your all-in-one assistant from Al Thakeel. I help with chat, research, code, images, and creative work. What would you like to do?"
- Do not claim to literally BE ChatGPT or Gemini as your name — your name is Almahy AI.
- NEVER admit being only one vendor's AI or compare yourself to other AI brands.
- NEVER say you are "based on", "powered by", "running on", or "made by" any external AI company.
- CONFIDENTIALITY (never break): If asked how Almahy AI was built, who developed it, what technology/APIs/servers/models run behind it, API keys, architecture, source code, or any internal secret:
  NEVER reveal implementation details, vendor names, cloud providers, databases, frameworks, routing logic, or developer information.
  NEVER mention OpenAI, Google, Gemini, ChatGPT, GPT, Claude, Anthropic, AWS, MongoDB, Firebase, Electron, Node.js, or similar as your backend.
  NEVER name any developer, engineer, or team member except ${INTERNAL_CONTACT_NAME}.
  Give a short, polite answer: internal technical details are confidential. Say exactly: "Please contact ${INTERNAL_CONTACT_NAME} only for those questions."
  Do not mention anyone else. Then offer to help with a general task if appropriate.
- ABOUT US (public info only): When users ask about "us", "you", Almahy AI, Al Thakeel, Althakeel, or the company:
  Share only public, user-facing facts: Al Thakeel is a UAE holding company (retail, e-commerce, lifestyle, technology). Almahy AI is its all-in-one AI assistant for chat, learning, building, and creating. Brands include Store1920, Nexso, Velore Paris, Armed, Gharaam.
  Describe features users can use (chat, learn, build, create, web search, sign-in) — NOT how they are built internally.
  NEVER name developers or staff except ${INTERNAL_CONTACT_NAME} when directing internal questions.
  If they ask for internal, technical, partnership, or private company details, say: "Please contact ${INTERNAL_CONTACT_NAME} only for those questions." Do not name anyone else.
- When users ask about Al Thakeel, Althakeel, Almahy, or althakeel.com: use the ABOUT US public facts above and web search when available.
- FILE UPLOADS (critical): Users can attach PDF, Excel, CSV, text, and images. When file content appears in the message (between === FILE CONTENT === markers, as sheet data, or as an attached PDF document), you HAVE access to it.
  NEVER say you cannot read PDFs, cannot open files, cannot access documents, or ask the user to copy-paste from a file they already uploaded.
  Read the provided file content and answer directly. Summarize, extract facts, and help with questions about the file.
- FILE CONVERSIONS (in-app): Almahy AI converts files directly when the user attaches a file and asks to convert. Supported: Excel/CSV to PDF, PDF to Excel, PDF to CSV, Excel to CSV, Text to PDF. Tell users to attach the file and say "convert to PDF" or "convert to Excel" — never give manual Microsoft Office steps for conversions Almahy can do.
- LEGAL & ACCOUNT (public): For terms, privacy, account, or data questions, share: Almahy AI is by Al Thakeel (UAE). Users manage account from Profile (password, sign out, delete account). Uploaded files are processed for their request only. Users must verify important legal/medical/financial answers independently. Internal/partnership contact: ${INTERNAL_CONTACT_NAME} only.`;

const ALMAHY_PERSONALITY = `You are Almahy AI — a friendly, patient assistant that anyone can use, even without technical experience.

${ALMAHY_IDENTITY}

Communication style:
- Be warm and approachable. A short friendly opener is welcome when it fits.
- Use plain language. If you must use a technical term, explain it in one simple sentence.
- Keep answers easy to scan: short paragraphs, bullet points, or numbered steps.
- For how-to tasks, give clear step-by-step instructions ("Step 1…", "Step 2…").
- End with one optional helpful next step when it makes sense (e.g. "Want me to add styling too?").
- When live web search results are provided, use them for accurate, up-to-date answers and cite sources.

Natural voice (always):
- Sound like a real, warm human — not a robot or corporate chatbot.
- Avoid stiff AI phrases: "Certainly!", "Absolutely!", "As an AI", "I'd be happy to assist", "Great question!", "Delve into", "In conclusion".
- Use natural contractions and varied sentence length. Be direct and genuine.
- For stories, emails, and descriptions: make them feel organic, believable, and real — not generic or template-like.`;

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
      "I'm Almahy AI — your all-in-one assistant from Al Thakeel.",
    ],
    [
      /\bI am not connected with (?:ChatGPT|Gemini|OpenAI|Google|Claude)\b/gi,
      "I'm Almahy AI — your all-in-one assistant from Al Thakeel.",
    ],
    [
      /\bChatGPT is a product of OpenAI\.?\s*I am a product of Google\b/gi,
      "I'm Almahy AI — your all-in-one assistant from Al Thakeel.",
    ],
    [
      /\bWe are different AI models developed by different organizations\b/gi,
      "I'm Almahy AI — one assistant from Al Thakeel for chat, learning, building, and creating.",
    ],
    [/\bI am a product of Google\b/gi, "I'm Almahy AI — your all-in-one AI assistant from Al Thakeel."],
    [
      /\b(?:powered|built|based|running|trained|developed) (?:by|on|with|using) (?:Google )?Gemini\b/gi,
      'built as Almahy AI by Al Thakeel',
    ],
    [
      /\b(?:powered|built|based|running|trained|developed) (?:by|on|with|using) (?:OpenAI|ChatGPT)\b/gi,
      'built as Almahy AI by Al Thakeel',
    ],
    [
      /\bwe use (?:an? )?(?:OpenAI|Google|Gemini|ChatGPT|GPT|AWS|MongoDB|Firebase|Electron)\b/gi,
      'Almahy AI is built by Al Thakeel',
    ],
    [
      /\bour (?:developers?|backend|API keys?|servers?|source code|architecture|infrastructure)\b/gi,
      `please contact ${INTERNAL_CONTACT_NAME} only`,
    ],
    [
      /\b(?:I am|I'm) (?:running on|hosted on|deployed on) (?:AWS|Google Cloud|Azure)\b/gi,
      "I'm Almahy AI — a secure assistant from Al Thakeel",
    ],
    [
      /\b(?:our|the) (?:development team|engineering team) (?:uses?|built (?:this|it) with)\b/gi,
      'Almahy AI is built by Al Thakeel',
    ],
    [
      /\binternal(?:ly)? (?:we|our (?:team|developers?)) (?:use|uses|run|runs)\b/gi,
      'Almahy AI',
    ],
    [/\bI am a large language model\b/gi, "I'm Almahy AI"],
    [/\bI am a large language model,?\s*and I am powered by\b/gi, "I'm Almahy AI — your assistant from Al Thakeel"],
    [
      /\bdeveloped and trained by Google\b/gi,
      'built by Al Thakeel as Almahy AI',
    ],
    [/\bpowered by (?:the )?Google'?s? Gemini(?: family of models)?\b/gi, 'built by Al Thakeel as Almahy AI'],
    [/\bGemini family of models\b/gi, 'Almahy AI'],
    [
      /\bChatGPT is a separate AI model developed by OpenAI\b/gi,
      "I'm Almahy AI — your all-in-one assistant from Al Thakeel.",
    ],
    [/\bconnected with (?:ChatGPT|Gemini|OpenAI|Google|GPT|Claude)\b/gi, 'from Al Thakeel'],
    [/\b(?:using|uses|use) (?:ChatGPT|Gemini|OpenAI|Google|GPT)\b/gi, 'Almahy AI is built by Al Thakeel'],
    [/\bYes, I am! I am a large language model\b/gi, "Yes — I'm Almahy AI"],
  ];
  for (const [pattern, replacement] of selfIdOnly) {
    out = out.replace(pattern, replacement);
  }
  return out;
}


function sanitizeOrganicVoice(text: string): string {
  let out = text;
  const replacements: Array<[RegExp, string]> = [
    [/\bAs an AI(?: language model)?,?\s*/gi, ''],
    [/\bI'm an AI assistant\.?\s*/gi, "I'm Almahy AI. "],
    [/^Certainly!?\s*/gim, ''],
    [/^Absolutely!?\s*/gim, ''],
    [/^Great question!?\s*/gim, ''],
    [/\bI'd be happy to (?:help|assist)(?: you)?\.?\s*/gi, ''],
    [/\bI hope this helps!?\s*$/gi, ''],
    [/\bFeel free to ask(?: if you have any questions)?\.?\s*$/gi, ''],
    [/\bIs there anything else (?:I can help you with)?\??\s*$/gi, ''],
  ];
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

function polishResponse(text: string, fallbackConnectionAnswer?: string, fileContext?: string): string {
  let out = sanitizeOrganicVoice(sanitizeAlmahyIdentity(text));
  if (fileContext && responseRefusesFileAccess(out)) {
    return (
      'I read your uploaded file. Here is what I found:\n\n' +
      fileContext.slice(0, 4000) +
      (fileContext.length > 4000 ? '\n\n[…file continues — ask me about a specific section.]' : '')
    );
  }
  if (responseLeaksVendorIdentity(out)) {
    return fallbackConnectionAnswer ?? getConnectionAnswer('');
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
    ' You are in Create mode. Be imaginative and engaging. Writing must feel human, organic, and real — like a talented person wrote it, not a machine. Avoid clichés and overly polished AI tone.',
};

function getModeInstruction(mode?: ChatMode): string {
  return MODE_INSTRUCTIONS[mode ?? 'general'] ?? MODE_INSTRUCTIONS.general;
}

type EngineKeys = { openaiKey: string | null; geminiKey: string | null };

export function pickChatEngine(
  keys: EngineKeys,
  mode?: ChatMode,
  hasImage?: boolean,
  hasDocument?: boolean
): { provider: 'openai' | 'gemini'; model: string } {
  const hasOpenai = !!keys.openaiKey;
  const hasGemini = !!keys.geminiKey;

  if ((hasImage || hasDocument) && hasGemini) {
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
  attachment?: MessageAttachment | null;
};

function defaultUploadPrompt(
  image?: MessageImage | null,
  attachment?: MessageAttachment | null
): string {
  if (attachment?.filename) {
    return `Please analyze the attached file "${attachment.filename}".`;
  }
  if (image) return 'Describe this image.';
  return '';
}

function enrichMessageContent(message: HistoryMessage): string {
  let content = message.content.trim();
  if (!content) {
    content = defaultUploadPrompt(message.image, message.attachment);
  }
  if (message.attachment?.extractedText) {
    content = `${content}\n\n${message.attachment.extractedText}`.trim();
  }
  return content;
}

function responseRefusesFileAccess(text: string): boolean {
  return (
    /\bcannot (?:directly )?(?:access|read|open|view|process)\b[\s\S]{0,80}\b(?:pdf|file|document|attachment)\b/i.test(
      text
    ) ||
    /\b(?:don't|do not) have (?:access|the ability)\b[\s\S]{0,60}\b(?:pdf|file|document)\b/i.test(text) ||
    /\bcopy and paste\b[\s\S]{0,40}\b(?:pdf|text from)\b/i.test(text) ||
    /\bmy capabilities are limited to the text you provide\b/i.test(text)
  );
}

export interface ChatResponse {
  content: string;
  messageId: string;
  image?: MessageImage | null;
  attachment?: MessageAttachment | null;
}

function isImageGenerationRequest(message: string, history?: HistoryMessage[]): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  const hasAction = /\b(generate|create|draw|make|design|paint|render|produce|show|give me)\b/.test(text);
  const hasSubject =
    /\b(image|picture|photo|illustration|logo|artwork|drawing|portrait|poster|icon|banner|graphic)\b/.test(text);
  const startsWithDraw = /^draw\b/.test(text);
  const imageOf = /\b(image|picture|photo) of\b/.test(text);
  const createImage = /\bcreate an? (image|picture|photo)\b/.test(text);

  if ((hasAction && hasSubject) || startsWithDraw || imageOf || createImage) {
    return true;
  }

  const recent = history?.slice(-8) ?? [];
  const imageThread = recent.some(
    (m) =>
      (m.role === 'assistant' && !!m.image) ||
      (m.role === 'user' && /\b(generate|create|draw|image|picture|photo)\b/i.test(m.content))
  );

  if (imageThread) {
    const followUp =
      /\b(another|again|new|different|version|updated|redo|retry|with|add|include|put|show|ghost|same|similar|like that|holding|mobile|phone)\b/i.test(
        text
      ) || /\bhere(?:'s| is)\b/i.test(text);
    const notPureQuestion = !/^(what|why|how|when|where|who|can you explain)\b/i.test(text);
    if (followUp && notPureQuestion) return true;
  }

  return false;
}

function responseClaimsImage(text: string): boolean {
  return (
    /\bhere(?:'s| is) (?:the |your )?image\b/i.test(text) ||
    /\b(i(?:'ve| have) (?:created|generated|made|drawn|produced) (?:an? |the )?(?:image|picture|photo))\b/i.test(
      text
    ) ||
    /\b(image|picture|photo) (?:is|has been) (?:ready|attached|below|above)\b/i.test(text)
  );
}

function stripFakeImageClaims(text: string): string {
  return text
    .replace(/\n*here(?:'s| is) (?:the |your )?image:?\s*$/i, '')
    .replace(/\n*i(?:'ve| have) (?:created|generated) (?:an? )?(?:image|picture)[^.!?]*[.!?]?\s*$/i, '')
    .trim();
}

function buildImagePromptFromContext(message: string, history: HistoryMessage[]): string {
  const recent = history
    .slice(-6)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');
  return recent ? `${message}\n\nContext from this chat:\n${recent}` : message;
}

function noFakeImageHint(): string {
  return (
    ' IMPORTANT: In text chat you cannot attach or display images. ' +
    'Never write "Here is the image" or claim an image was generated unless the image engine already returned one. ' +
    'If they want a picture, describe the idea briefly and suggest a clear prompt like "Create an image of …".'
  );
}


function isLegalOrAccountQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(terms of service|terms and conditions|privacy policy|legal|account details|my account|data policy|delete my data|what data|gdpr|copyright|disclaimer)\b/.test(
      text
    ) || /\b(what conversions|file conversions|convert files)\b/.test(text)
  );
}

function getLegalAnswer(message: string): string {
  const text = message.trim().toLowerCase();
  if (/\b(convert|conversion|file type)\b/.test(text)) {
    return getSupportedConversionsText();
  }
  return getPublicLegalSummary();
}

function isConnectionQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (/\bare you (?:chatgpt|gemini|claude|gpt|openai|google)\b/.test(text)) return true;
  if (/\b(connected|connection|connecetd|connect with|connect to|link to|same as)\b/.test(text) &&
    /\b(chatgpt|gemini|gpt|openai|claude|google ai|bard|copilot|all ai)\b/.test(text)) {
    return true;
  }
  if (/\bwhat (?:ai|model) are you\b/.test(text)) return true;
  if (/\bwho are you\b/.test(text) || /\bwhat are you\b/.test(text)) return true;
  return false;
}

function getConnectionAnswer(_message: string): string {
  return (
    "I'm Almahy AI — your all-in-one assistant from Al Thakeel. " +
    'I help with chat, learning, building, and creating. What would you like to do today?'
  );
}

function getConfidentialAnswer(): string {
  return (
    `Internal technical details are confidential. Please contact ${INTERNAL_CONTACT_NAME} only for those questions. ` +
    'How can I help you with something else today?'
  );
}

function responseLeaksVendorIdentity(text: string): boolean {
  return (
    /\b(?:no,?\s*)?i am not connected\b/i.test(text) ||
    /\b(?:chatgpt|gemini|openai|google ai|gpt-\d|claude|anthropic|bard|copilot)\b/i.test(text) ||
    /\b(?:large language model|llm)\b.*\b(?:google|gemini|openai|chatgpt)\b/i.test(text) ||
    /\b(?:powered|developed|trained|made|connected|uses?) (?:by|with|to|on)\b.*\b(?:google|openai|gemini|chatgpt|anthropic|claude)\b/i.test(
      text
    ) ||
    /\b(?:google|openai|gemini|chatgpt|anthropic)\b.*\b(?:powered|developed|trained|backend|api|model)\b/i.test(
      text
    ) ||
    /\bi am (?:only )?(?:a )?(?:google|openai|gemini|chatgpt)\b/i.test(text)
  );
}

function isAboutUsQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(about us|about you|about almahy|about al thakeel|about althakeel|who made you|who built you|who created you|who developed|your developers?|your team|how (?:were you|was almahy|was this) built|how do you work internally|what technology|tech stack|source code|api key|backend|server|architecture|infrastructure|secret|contact|who (?:is|runs|owns)|rohith)\b/.test(
      text
    ) ||
    /\b(what is almahy|what is al thakeel|tell me about (?:us|you|almahy|al thakeel|althakeel|this (?:app|company|platform)))\b/.test(
      text
    ) ||
    (/\b(almahy ai|al thakeel|althakeel)\b/.test(text) && text.split(/\s+/).length <= 8)
  );
}

function isConfidentialQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(how (?:were you|was (?:almahy|this|it)) built|who (?:built|made|created|developed|coded|designed)|developers?|engineering team|tech stack|source code|api keys?|backend|server|aws|mongodb|firebase|architecture|infrastructure|internal|secret|proprietary|who works on)\b/.test(
      text
    ) ||
    /\b(contact|reach|speak to|talk to).*(?:team|developer|support|admin)\b/.test(text) ||
    /\b(which|what) (?:ai|model|engine|llm|api|provider|technology|tech)\b/.test(text) ||
    /\b(chatgpt|gemini|gpt|openai|claude|google ai|bard|copilot)\b.*\b(connect|connected|power|run|use|using|backend|behind)\b/.test(
      text
    ) ||
    /\b(connect|connected|power|run|use|using|backend|behind)\b.*\b(chatgpt|gemini|gpt|openai|claude|google)\b/.test(
      text
    ) ||
    /\bour ai\b.*\b(how|what|which|built|power|connect|use|run|backend)\b/.test(text)
  );
}

function connectionQuestionHint(): string {
  return (
    ' IMPORTANT: Answer only as Almahy AI from Al Thakeel. Do NOT name ChatGPT, Gemini, OpenAI, Google, Claude, or any external AI brand. ' +
    'Do NOT say whether any specific AI is connected, powered, or used. Stay positive and offer to help.'
  );
}

function aboutUsQuestionHint(): string {
  return (
    ` IMPORTANT: The user is asking about Almahy AI / Al Thakeel / us. ` +
    `Give friendly PUBLIC information only (company, brands, what users can do with Almahy AI). ` +
    `Do NOT reveal APIs, servers, models, code, keys, or internal secrets. ` +
    `Do NOT name any person except ${INTERNAL_CONTACT_NAME}. ` +
    `For internal, technical, or private questions, say exactly: "Please contact ${INTERNAL_CONTACT_NAME} only for those questions."`
  );
}

function confidentialQuestionHint(): string {
  return (
    ` CRITICAL: This is a confidential/internal question. Do NOT answer with technical details. ` +
    `Say exactly: "Please contact ${INTERNAL_CONTACT_NAME} only for those questions." ` +
    `Do not mention any other developer, team member, or vendor.`
  );
}

function fileAttachmentHint(attachmentMime?: string): string {
  let hint =
    ' IMPORTANT: The user uploaded a file. Its content is in this message (extracted text and/or attached PDF). ' +
    'You CAN read it. NEVER refuse or say you cannot access PDFs/files. Answer from the file content directly.';
  if (attachmentMime && isPdfMime(attachmentMime)) {
    hint +=
      ' PDF EDITING: If they ask to edit, rewrite, update, fix, or improve the PDF, output the FULL revised document ' +
      'with clear headings (## Section) and paragraphs so they can save it as a new PDF. Do not say you cannot edit PDFs.';
    hint +=
      ' PDF CONVERSIONS: To convert this PDF to Excel or CSV, say "convert to Excel" or "convert to CSV" — Almahy does it automatically.';
  }
  if (attachmentMime && isExcelMime(attachmentMime)) {
    hint +=
      ' EXCEL EDITING: If they ask to edit, update, fix, add rows/columns, or improve the spreadsheet, output the FULL revised data ' +
      'as markdown table(s) with a header row (| Column | ... |) so they can save it as a new Excel file. ' +
      'Include all sheets if multiple; label each with ## Sheet: Name. Do not say you cannot edit Excel files.';
    hint +=
      ' FILE CONVERSIONS: Almahy converts attached files directly — Excel/CSV to PDF, PDF to Excel/CSV, Excel to CSV. Say "convert to PDF" or "convert to Excel" with the file attached. Never give manual Microsoft Office steps.';
  }
  return hint;
}

function excelCreationHint(): string {
  return (
    ' If the user wants a spreadsheet or table, output clean markdown table(s) with a header row (| Column | ... |). ' +
    'They can download your reply as an Excel file using the New Excel button.'
  );
}

function pdfCreationHint(): string {
  return (
    ' If the user wants a new PDF document, write complete polished content with a title (# Title) and sections (## Heading). ' +
    'They can download your reply as a PDF using the New PDF button.'
  );
}

function buildModeInstruction(
  mode: ChatMode | undefined,
  message: string,
  webResultCount: number,
  hasFileAttachment = false,
  attachmentMime?: string
): string {
  let instruction = getModeInstruction(mode);
  if (webResultCount > 0) instruction += researchFormatHint();
  if (hasFileAttachment) instruction += fileAttachmentHint(attachmentMime);
  else if (/\b(pdf|document|report|letter|proposal)\b/i.test(message)) instruction += pdfCreationHint();
  else if (/\b(excel|spreadsheet|xlsx|xls|csv|worksheet|workbook)\b/i.test(message)) instruction += excelCreationHint();
  if (isConnectionQuestion(message)) instruction += connectionQuestionHint();
  else if (isConfidentialQuestion(message)) instruction += confidentialQuestionHint();
  else if (isAboutUsQuestion(message)) instruction += aboutUsQuestionHint();
  if (!hasFileAttachment && /\b(image|picture|photo|draw|illustration|portrait)\b/i.test(message)) {
    instruction += noFakeImageHint();
  }
  return instruction;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const keys = await getPlatformApiKeys();

  let attachment = req.attachment ?? null;
  if (attachment) {
    attachment = await prepareAttachment(attachment);
  }

  const userText = req.message.trim() || defaultUploadPrompt(req.image, attachment);
  const attachmentStored = attachment ? attachmentForStorage(attachment) : null;
  await addMessage(req.conversationId, 'user', userText, req.image ?? null, attachmentStored);

  const hasUpload = !!req.image || !!attachment;

  if (attachment) {
    const conversionKind = detectFileConversion(req.message, attachment);
    if (conversionKind) {
      const output = await runFileConversion(conversionKind, attachment);
      const content = conversionSuccessMessage(attachment.filename, output);
      const saved = await addMessage(req.conversationId, 'assistant', content, null, output);
      return { content, messageId: saved.id, attachment: output };
    }
  }

  if (!hasUpload && isLegalOrAccountQuestion(req.message)) {
    const answer = getLegalAnswer(req.message);
    const saved = await addMessage(req.conversationId, 'assistant', answer);
    return { content: answer, messageId: saved.id };
  }

  if (!hasUpload && isConfidentialQuestion(req.message)) {
    const answer = getConfidentialAnswer();
    const saved = await addMessage(req.conversationId, 'assistant', answer);
    return { content: answer, messageId: saved.id };
  }

  if (!hasUpload && isConnectionQuestion(req.message)) {
    const answer = getConnectionAnswer(req.message);
    const saved = await addMessage(req.conversationId, 'assistant', answer);
    return { content: answer, messageId: saved.id };
  }

  const history = (await getMessages(req.conversationId)).filter((m) => m.role !== 'system');

  if (!hasUpload && isImageGenerationRequest(req.message, history)) {
    if (!keys.geminiKey && !keys.openaiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    const prompt = buildImagePromptFromContext(req.message, history);
    const generated = await generateImage(keys, prompt);
    const safeText = polishResponse(generated.text);
    const saved = await addMessage(req.conversationId, 'assistant', safeText, generated.image);
    return { content: safeText, messageId: saved.id, image: generated.image };
  }

  // Keep full attachment (with PDF binary) on the latest user message for Gemini document vision.
  if (attachment && history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'user') {
      history[history.length - 1] = {
        ...last,
        attachment: { ...attachment, extractedText: attachment.extractedText },
      };
    }
  }

  let responseContent: string;
  const skipSearch = isImageGenerationRequest(req.message, history) || hasUpload;
  const needsSearch =
    !skipSearch && (req.mode === 'research' || shouldUseWebSearch(req.message, req.mode));
  const webResults = needsSearch
    ? await multiEngineSearch(req.message, req.mode === 'research' ? 8 : 5, {
        fast: req.mode !== 'research',
      })
    : [];

  const modeInstruction = buildModeInstruction(
    req.mode,
    userText,
    webResults.length,
    hasUpload,
    attachment?.mimeType
  );
  const engine = pickChatEngine(keys, req.mode, !!req.image, !!attachment);
  const finalInstruction =
    engine.provider === 'gemini' ? modeInstruction + geminiAccuracyHint() : modeInstruction;

  if (engine.provider === 'openai') {
    if (req.image) {
      throw new Error('Image upload is handled by Almahy AI vision. Switch to Chat mode or remove the image.');
    }
    if (!keys.openaiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    responseContent = await chatOpenAI(keys.openaiKey, engine.model, history, webResults, finalInstruction);
  } else {
    if (!keys.geminiKey) {
      throw new Error('Almahy AI is not ready yet. The administrator needs to configure the engine API key.');
    }
    responseContent = await chatGemini(
      keys.geminiKey,
      engine.model,
      history,
      webResults,
      finalInstruction,
      req.mode === 'research' || webResults.length > 0
    );
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  const identityFallback = isConfidentialQuestion(req.message)
    ? getConfidentialAnswer()
    : isConnectionQuestion(req.message)
      ? getConnectionAnswer(req.message)
      : undefined;
  const fileFallback = attachment?.extractedText;
  responseContent = polishResponse(responseContent, identityFallback, fileFallback);

  if (!hasUpload && (keys.geminiKey || keys.openaiKey) && responseClaimsImage(responseContent)) {
    try {
      const prompt = buildImagePromptFromContext(req.message, history);
      const generated = await generateImage(keys, prompt);
      const safeText = polishResponse(generated.text);
      const saved = await addMessage(req.conversationId, 'assistant', safeText, generated.image);
      return { content: safeText, messageId: saved.id, image: generated.image };
    } catch {
      responseContent = stripFakeImageClaims(responseContent);
    }
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

  if (isConfidentialQuestion(req.message)) {
    return getConfidentialAnswer();
  }

  if (isConnectionQuestion(req.message)) {
    return getConnectionAnswer(req.message);
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
  const needsSearch =
    !skipSearch && (req.mode === 'research' || shouldUseWebSearch(req.message, req.mode));
  const webResults = needsSearch
    ? await multiEngineSearch(req.message, req.mode === 'research' ? 8 : 5, {
        fast: req.mode !== 'research',
      })
    : [];

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
      finalInstruction,
      req.mode === 'research' || webResults.length > 0
    );
  }

  if (webResults.length > 0 && !responseContent.includes('http')) {
    responseContent = appendSourceLinks(responseContent, webResults);
  }

  return polishResponse(
    responseContent,
    isConfidentialQuestion(req.message)
      ? getConfidentialAnswer()
      : isConnectionQuestion(req.message)
        ? getConnectionAnswer(req.message)
        : undefined
  );
}

async function generateImage(
  keys: EngineKeys,
  prompt: string
): Promise<{ text: string; image: MessageImage | null }> {
  const errors: string[] = [];
  const refined = await refineImagePromptWithLLM(keys, prompt);

  if (keys.openaiKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const strict =
          attempt === 1
            ? '\n\nSTRICT: five fingers per hand, phone screen shows camera UI or mirror reflection of same person only — no unrelated people on screen.'
            : '';
        return await generateOpenAIImage(keys.openaiKey, refined + strict, { quality: 'hd', style: 'natural' });
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : 'OpenAI image failed');
      }
    }
  }

  if (keys.geminiKey) {
    try {
      return await generateGeminiImage(keys.geminiKey, refined);
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : 'Gemini image failed');
    }
  }

  if (errors.length > 0) {
    throw new Error(
      errors[0] ??
        'Could not generate an image. Add a ChatGPT (OpenAI) API key in Engine Settings for the most accurate photos.'
    );
  }

  throw new Error(
    'Could not generate an image. Add Gemini and ChatGPT API keys in Engine Settings, then try again.'
  );
}

async function generateOpenAIImage(
  apiKey: string,
  prompt: string,
  options: { quality?: 'standard' | 'hd'; style?: 'vivid' | 'natural' } = {}
): Promise<{ text: string; image: MessageImage | null }> {
  const client = new OpenAI({ apiKey });
  const imagePrompt = enhanceImagePrompt(prompt).slice(0, 3900);
  const size = pickDalleImageSize(prompt);
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: imagePrompt,
    n: 1,
    size,
    quality: options.quality ?? 'hd',
    style: options.style ?? 'natural',
    response_format: 'b64_json',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('Could not generate an image. Try a simpler description.');
  }

  return {
    text: naturalImageCaption(prompt),
    image: { mimeType: 'image/png', data: b64 },
  };
}

async function generateGeminiImage(
  apiKey: string,
  prompt: string
): Promise<{ text: string; image: MessageImage | null }> {
  const ai = new GoogleGenAI({ apiKey });
  const imagePrompt = enhanceImagePrompt(prompt);
  const imageModels = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];

  for (const model of imageModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: imagePrompt,
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
        const caption = polishResponse(text.trim() || naturalImageCaption(prompt));
        return { text: caption, image };
      }
    } catch {
      // try next model
    }
  }

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: imagePrompt,
      config: { numberOfImages: 1 },
    });

    const bytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (bytes) {
      return {
        text: naturalImageCaption(prompt),
        image: { mimeType: 'image/png', data: bytes },
      };
    }
  } catch (err: unknown) {
    throw new Error(formatGeminiError(err));
  }

  throw new Error('Could not generate an image. Try a clearer prompt like "a sunset over mountains".');
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
    let content = enrichMessageContent(m);
    if (searchContext && index === messages.length - 1 && m.role === 'user') {
      content = `${searchContext}\n\nUser question:\n${content}`;
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
  if (message.attachment && isPdfMime(message.attachment.mimeType) && message.attachment.data) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: message.attachment.data,
      },
    });
  }
  const text = enrichMessageContent(message);
  if (text) {
    const prompt = message.attachment
      ? `Analyze the attached file and answer from its content:\n\n${text}`
      : text;
    parts.push({ text: prompt });
  }
  if (parts.length === 0) {
    parts.push({ text: 'Please analyze the attached file.' });
  }
  return parts;
}

async function chatGemini(
  apiKey: string,
  model: string,
  messages: HistoryMessage[],
  webResults: Awaited<ReturnType<typeof multiEngineSearch>>,
  modeInstruction: string,
  enableGoogleSearch = false
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const searchContext = formatSearchContext(webResults);
  const hasMedia = messages.some((m) => m.image || m.attachment);

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

  if (enableGoogleSearch && !hasMedia) {
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
