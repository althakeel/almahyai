import { memo, useState, useEffect, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import type { Conversation, Message, MessageImage, ChatMode } from '../types';
import { orionApi } from '../api/client';
import MarkdownMessage from './MarkdownMessage';
import QuickPrompts from './QuickPrompts';
import ChatModeBar from './ChatModeBar';
import { QUICK_PROMPTS, GUEST_QUICK_PROMPTS, getModeConfig } from '../config/chatModes';
import type { QuickPrompt } from '../config/chatModes';
import {
  imageDataUrl,
  copyTextToClipboard,
  copyImageToClipboard,
  saveImageToFile,
  shareImage,
} from '../utils/clipboard';
import {
  exportMessagesToPdf,
  exportMessagesToExcel,
  exportMessageToPdf,
  exportMessageToExcel,
} from '../utils/export';
import {
  IconDownload,
  IconCopy,
  IconShare,
  IconCheck,
  IconImage,
  IconTextCopy,
  IconPdf,
  IconExcel,
} from './Icons';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Props {
  conversation: Conversation;
  userName: string;
  simpleMode?: boolean;
  guestMode?: boolean;
  guestRemaining?: number;
  guestLimit?: number;
  guestApiReady?: boolean;
  onGuestRemainingChange?: (remaining: number) => void;
  onSignInRequired?: () => void;
  onTitleUpdate: (title: string) => void;
}

function imageSrc(image: MessageImage): string {
  return imageDataUrl(image);
}

type CopiedKey = string | null;

interface MessageRowProps {
  msg: Message;
  userName: string;
  copied: CopiedKey;
  onCopyText: (id: string, text: string) => void;
  onCopyImage: (id: string, image: MessageImage) => void;
  onSaveImage: (image: MessageImage, id: string) => void;
  onShareImage: (id: string, image: MessageImage) => void;
  onExportPdf: (msg: Message) => void;
  onExportExcel: (msg: Message) => void;
  shareLabel: (id: string) => string;
}

const MessageRow = memo(function MessageRow({
  msg,
  userName,
  copied,
  onCopyText,
  onCopyImage,
  onSaveImage,
  onShareImage,
  onExportPdf,
  onExportExcel,
  shareLabel,
}: MessageRowProps) {
  return (
    <div className={`chat-row ${msg.role}`}>
      <div className={`chat-avatar ${msg.role}`}>
        {msg.role === 'user' ? userName[0]?.toUpperCase() : 'O'}
      </div>
      <div className="chat-bubble">
        <div className="chat-bubble-header">
          <div className="chat-role-row">
            <div className="chat-role">{msg.role === 'user' ? 'You' : 'Almahy AI'}</div>
            <time className="chat-time" dateTime={msg.createdAt}>
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
          {(msg.content || msg.image) && msg.id !== 'error' && (
            <div className="message-actions">
              {msg.content && (
                <>
                  <button
                    type="button"
                    className="message-action-btn icon-action"
                    onClick={() => onCopyText(msg.id, msg.content)}
                    title="Copy text"
                    aria-label="Copy text"
                  >
                    {copied === `${msg.id}-text` ? <IconCheck size={14} /> : <IconTextCopy size={14} />}
                    <span>{copied === `${msg.id}-text` ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    className="message-action-btn icon-action icon-only"
                    onClick={() => onExportPdf(msg)}
                    title="Save as PDF"
                    aria-label="Save as PDF"
                  >
                    <IconPdf size={14} />
                  </button>
                  <button
                    type="button"
                    className="message-action-btn icon-action icon-only"
                    onClick={() => onExportExcel(msg)}
                    title="Save as Excel"
                    aria-label="Save as Excel"
                  >
                    <IconExcel size={14} />
                  </button>
                </>
              )}
              {msg.image && (
                <button
                  type="button"
                  className="message-action-btn icon-action"
                  onClick={() => onCopyImage(msg.id, msg.image!)}
                  title="Copy image"
                  aria-label="Copy image"
                >
                  {copied === `${msg.id}-image` ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  <span>{copied === `${msg.id}-image` ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          )}
        </div>
        {msg.image && (
          <div className="chat-image-wrap">
            <div className="chat-image-frame">
              <img
                className="chat-image"
                src={imageSrc(msg.image)}
                alt="Chat attachment"
                loading="lazy"
                decoding="async"
              />
              <div className="chat-image-badge" title="Image attachment">
                <IconImage size={14} />
              </div>
              <div className="chat-image-float-actions">
                <button
                  type="button"
                  className="image-float-btn"
                  onClick={() => onSaveImage(msg.image!, msg.id)}
                  title="Download image"
                  aria-label="Download image"
                >
                  {copied === `${msg.id}-save` ? <IconCheck size={16} /> : <IconDownload size={16} />}
                </button>
                <button
                  type="button"
                  className="image-float-btn"
                  onClick={() => onCopyImage(msg.id, msg.image!)}
                  title="Copy image"
                  aria-label="Copy image"
                >
                  {copied === `${msg.id}-image` ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </button>
                <button
                  type="button"
                  className="image-float-btn"
                  onClick={() => onShareImage(msg.id, msg.image!)}
                  title="Share image"
                  aria-label="Share image"
                >
                  {copied?.startsWith(`${msg.id}-share`) ? <IconCheck size={16} /> : <IconShare size={16} />}
                </button>
              </div>
            </div>
            <div className="chat-image-toolbar">
              <button
                type="button"
                className="image-toolbar-btn icon-action primary"
                onClick={() => onSaveImage(msg.image!, msg.id)}
                title="Download image"
                aria-label="Download image"
              >
                {copied === `${msg.id}-save` ? <IconCheck size={16} /> : <IconDownload size={16} />}
                <span>{copied === `${msg.id}-save` ? 'Downloaded' : 'Download'}</span>
              </button>
              <button
                type="button"
                className="image-toolbar-btn icon-action"
                onClick={() => onCopyImage(msg.id, msg.image!)}
                title="Copy image"
                aria-label="Copy image"
              >
                {copied === `${msg.id}-image` ? <IconCheck size={16} /> : <IconCopy size={16} />}
                <span>{copied === `${msg.id}-image` ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                className="image-toolbar-btn icon-action"
                onClick={() => onShareImage(msg.id, msg.image!)}
                title="Share image"
                aria-label="Share image"
              >
                {copied?.startsWith(`${msg.id}-share`) ? <IconCheck size={16} /> : <IconShare size={16} />}
                <span>{shareLabel(msg.id)}</span>
              </button>
            </div>
          </div>
        )}
        {msg.content && (
          <MarkdownMessage content={msg.content} isAssistant={msg.role === 'assistant'} />
        )}
      </div>
    </div>
  );
});

export default function ChatPanel({
  conversation,
  userName,
  simpleMode: _simpleMode = false,
  guestMode = false,
  guestRemaining = 0,
  guestLimit = 20,
  guestApiReady = true,
  onGuestRemainingChange,
  onSignInRequired,
  onTitleUpdate,
}: Props) {
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<MessageImage | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState<CopiedKey>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesCache = useRef<Map<string, Message[]>>(new Map());

  useEffect(() => {
    if (guestMode) return;

    const cached = messagesCache.current.get(conversation.id);
    if (cached) {
      setMessages(cached);
    }

    let cancelled = false;
    orionApi.messages.list(conversation.id).then((list) => {
      if (cancelled) return;
      messagesCache.current.set(conversation.id, list);
      setMessages(list);
    });

    return () => {
      cancelled = true;
    };
  }, [conversation.id, guestMode]);

  useEffect(() => {
    if (guestMode) return;
    messagesCache.current.set(conversation.id, messages);
  }, [conversation.id, messages, guestMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: sending ? 'auto' : 'smooth' });
  }, [messages, sending]);

  const composerDisabled =
    sending || (guestMode && (!guestApiReady || guestRemaining <= 0));

  const focusComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el || composerDisabled) return;
    el.focus();
  }, [composerDisabled]);

  useEffect(() => {
    const timer = window.setTimeout(focusComposer, 80);
    return () => window.clearTimeout(timer);
  }, [conversation.id, focusComposer]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' || e.key === 'Tab' || /^F\d+$/.test(e.key)) return;

      const el = textareaRef.current;
      if (!el || composerDisabled) return;

      if (e.key.length === 1) {
        e.preventDefault();
        el.focus();
        setInput((prev) => {
          const next = prev + e.key;
          requestAnimationFrame(() => {
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
          });
          return next;
        });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        el.focus();
        setInput((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composerDisabled]);

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setPendingPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (guestMode) {
      onSignInRequired?.();
      alert('Image upload requires a signed-in account. Sign in for unlimited chat and images.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('Please choose a JPEG, PNG, WebP, or GIF image.');
      clearPendingImage();
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image must be 4 MB or smaller.');
      clearPendingImage();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) return;
      setPendingImage({ mimeType: file.type, data: base64 });
      setPendingPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || sending) return;

    if (guestMode && !guestApiReady) {
      onSignInRequired?.();
      return;
    }

    if (guestMode && guestRemaining <= 0) {
      alert('You have used all 20 free guest messages today from your network. Sign in for unlimited access.');
      onSignInRequired?.();
      return;
    }

    if (guestMode && pendingImage) {
      onSignInRequired?.();
      alert('Image upload requires sign in.');
      return;
    }

    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const imageToSend = guestMode ? null : pendingImage;
    const now = new Date().toISOString();
    const tempUserMsg: Message = {
      id: 'temp-user',
      conversationId: conversation.id,
      role: 'user',
      content: text || 'Describe this image.',
      image: imageToSend,
      createdAt: now,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    clearPendingImage();

    try {
      if (guestMode) {
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content }));

        const result = await orionApi.guest.chat(text, history, chatMode);
        onGuestRemainingChange?.(result.remaining);

        setMessages((prev) => {
          const kept = prev.filter((m) => m.id !== 'temp-user');
          return [
            ...kept,
            { ...tempUserMsg, id: `user-${Date.now()}` },
            {
              id: `assistant-${Date.now()}`,
              conversationId: conversation.id,
              role: 'assistant',
              content: result.content,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      } else {
      const result = await orionApi.chat.send(
        conversation.id,
        text,
        conversation.provider,
        conversation.model,
        imageToSend,
        chatMode
      );

      if (result.content && result.messageId) {
        setMessages((prev) => {
          const kept = prev.filter((m) => m.id !== 'temp-user');
          return [
            ...kept,
            { ...tempUserMsg, id: `user-${result.messageId}` },
            {
              id: result.messageId!,
              conversationId: conversation.id,
              role: 'assistant',
              content: result.content!,
              image: result.image ?? null,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      } else {
        const updated = await orionApi.messages.list(conversation.id);
        setMessages(updated);
      }

      const titleSource = text || 'Image chat';
      if (conversation.title === 'New Chat' && titleSource.length > 0) {
        const newTitle = titleSource.slice(0, 40) + (titleSource.length > 40 ? '...' : '');
        orionApi.conversation.rename(conversation.id, newTitle).then(() => onTitleUpdate(newTitle));
      }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== 'temp-user'),
        {
          id: 'error',
          conversationId: conversation.id,
          role: 'assistant',
          content: errorMsg,
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    setSending(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const flashCopied = useCallback((key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  }, []);

  const handleCopyText = useCallback(
    async (messageId: string, text: string) => {
      try {
        await copyTextToClipboard(text);
        flashCopied(`${messageId}-text`);
      } catch {
        alert('Could not copy text.');
      }
    },
    [flashCopied]
  );

  const handleCopyImage = useCallback(
    async (messageId: string, image: MessageImage) => {
      try {
        await copyImageToClipboard(image);
        flashCopied(`${messageId}-image`);
      } catch {
        saveImageToFile(image);
        flashCopied(`${messageId}-save`);
      }
    },
    [flashCopied]
  );

  const handleSaveImage = useCallback(
    (image: MessageImage, messageId: string) => {
      saveImageToFile(image);
      flashCopied(`${messageId}-save`);
    },
    [flashCopied]
  );

  const handleShareImage = useCallback(
    async (messageId: string, image: MessageImage) => {
      try {
        const result = await shareImage(image);
        flashCopied(`${messageId}-share-${result}`);
      } catch {
        alert('Could not share this image.');
      }
    },
    [flashCopied]
  );

  const shareLabel = useCallback(
    (messageId: string) => {
      if (copied === `${messageId}-share-shared`) return 'Shared';
      if (copied === `${messageId}-share-copied`) return 'Copied';
      if (copied === `${messageId}-share-saved`) return 'Saved';
      return 'Share';
    },
    [copied]
  );

  const exportTitle = conversation.title || 'Orion Chat';

  const handleExportChatPdf = async () => {
    if (messages.length === 0) return;
    setExporting(true);
    try {
      await exportMessagesToPdf(messages, exportTitle);
      flashCopied('chat-pdf');
    } catch {
      alert('Could not create PDF.');
    }
    setExporting(false);
  };

  const handleExportChatExcel = () => {
    if (messages.length === 0) return;
    try {
      exportMessagesToExcel(messages, exportTitle);
      flashCopied('chat-excel');
    } catch {
      alert('Could not create Excel file.');
    }
  };

  const handleExportMsgPdf = useCallback(
    async (msg: Message) => {
      try {
        await exportMessageToPdf(msg, `${exportTitle}-message`);
        flashCopied(`${msg.id}-pdf`);
      } catch {
        alert('Could not create PDF.');
      }
    },
    [exportTitle, flashCopied]
  );

  const handleExportMsgExcel = useCallback(
    (msg: Message) => {
      try {
        exportMessageToExcel(msg, `${exportTitle}-message`);
        flashCopied(`${msg.id}-excel`);
      } catch {
        alert('Could not create Excel file.');
      }
    },
    [exportTitle, flashCopied]
  );

  const handleQuickPrompt = (prompt: QuickPrompt) => {
    setChatMode(prompt.mode);
    setInput(`${prompt.prompt} `);
    textareaRef.current?.focus();
  };

  const modeConfig = getModeConfig(chatMode);

  return (
    <div className="chat-panel">
      {messages.length > 0 && (
        <div className="chat-export-bar">
          <button
            type="button"
            className="chat-export-btn compact"
            onClick={handleExportChatPdf}
            disabled={exporting}
            title="Save chat as PDF"
          >
            <IconPdf size={15} />
            <span>{exporting ? 'Saving…' : 'Save PDF'}</span>
          </button>
          <button
            type="button"
            className="chat-export-btn compact"
            onClick={handleExportChatExcel}
            title="Save chat as Excel"
          >
            <IconExcel size={15} />
            <span>Save Excel</span>
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !sending && (
          <div className={`chat-welcome ${guestMode ? 'guest-welcome' : ''}`}>
            {guestMode ? (
              <>
                <div className="guest-welcome-badge">No account needed</div>
                <h2>Ask Orion anything</h2>
                <p>
                  You have <strong>{guestRemaining}</strong> of {guestLimit} free messages today.
                  Sign in anytime for unlimited chat, images, and exports.
                </p>
                <div className="guest-feature-grid">
                  <div className="guest-feature-card">
                    <span className="guest-feature-icon">💬</span>
                    <span className="guest-feature-title">Text chat</span>
                    <span className="guest-feature-desc">All AI modes</span>
                  </div>
                  <div className="guest-feature-card locked">
                    <span className="guest-feature-icon">🖼</span>
                    <span className="guest-feature-title">Images</span>
                    <span className="guest-feature-desc">Sign in required</span>
                  </div>
                  <div className="guest-feature-card locked">
                    <span className="guest-feature-icon">∞</span>
                    <span className="guest-feature-title">Unlimited</span>
                    <span className="guest-feature-desc">Free account</span>
                  </div>
                </div>
                {!guestApiReady && (
                  <p className="guest-welcome-note warn">
                    Guest chat server is updating — sign in to chat right now.
                  </p>
                )}
                <QuickPrompts prompts={GUEST_QUICK_PROMPTS} onSelect={handleQuickPrompt} />
              </>
            ) : (
              <>
                <div className="chat-welcome-icon">O</div>
                <h2>Hi! How can I help you today?</h2>
                <p>Pick a mode below or tap a suggestion to get started.</p>
                <QuickPrompts prompts={QUICK_PROMPTS} onSelect={handleQuickPrompt} />
              </>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            userName={userName}
            copied={copied}
            onCopyText={handleCopyText}
            onCopyImage={handleCopyImage}
            onSaveImage={handleSaveImage}
            onShareImage={handleShareImage}
            onExportPdf={handleExportMsgPdf}
            onExportExcel={handleExportMsgExcel}
            shareLabel={shareLabel}
          />
        ))}

        {sending && (
          <div className="chat-row assistant">
            <div className="chat-avatar assistant">O</div>
            <div className="chat-bubble">
              <p className="typing-label">Agent is thinking…</p>
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-composer">
        <ChatModeBar mode={chatMode} onChange={setChatMode} disabled={sending} />
        {pendingPreview && (
          <div className="composer-image-preview">
            <img src={pendingPreview} alt="Selected" loading="lazy" decoding="async" />
            <button type="button" className="composer-image-remove" onClick={clearPendingImage} aria-label="Remove image">
              ×
            </button>
          </div>
        )}
        <div className="composer-box">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="composer-file-input"
            onChange={handleImageSelect}
            disabled={sending}
          />
          <button
            type="button"
            className="composer-attach"
            onClick={() => {
              if (guestMode) {
                onSignInRequired?.();
                alert('Image upload requires sign in.');
                return;
              }
              fileInputRef.current?.click();
            }}
            disabled={sending}
            aria-label={guestMode ? 'Sign in to attach image' : 'Attach image'}
            title={guestMode ? 'Sign in to attach images' : 'Attach image'}
          >
            <IconImage size={20} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={guestMode ? 'Ask anything…' : modeConfig.placeholder}
            rows={1}
            disabled={sending || (guestMode && (!guestApiReady || guestRemaining <= 0))}
          />
          <button
            type="button"
            className="composer-send"
            onClick={handleSend}
            disabled={
              sending ||
              (guestMode && (!guestApiReady || guestRemaining <= 0)) ||
              (!input.trim() && !pendingImage)
            }
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        <p className="composer-hint">
          {guestMode
            ? guestApiReady
              ? `${guestRemaining} free messages left · Ctrl+Enter to send`
              : 'Sign in to continue chatting'
            : 'Ctrl+Enter to send'}
        </p>
      </div>
    </div>
  );
}
