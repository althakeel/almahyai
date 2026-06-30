import { memo, useState, useEffect, useRef, useCallback, KeyboardEvent, ChangeEvent, DragEvent } from 'react';
import type { Conversation, Message, MessageImage, MessageAttachment, ChatMode } from '../types';
import { orionApi } from '../api/client';
import MarkdownMessage from './MarkdownMessage';
import ConfirmDialog from './ConfirmDialog';
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
  exportTextToPdf,
  exportTextToExcel,
  downloadAttachment,
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
  IconPaperclip,
  IconFile,
} from './Icons';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'application/csv',
];

const FILE_PICKER_ACCEPT = {
  all: '*/*',
  image: 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',
  pdf: '.pdf,application/pdf',
  excel: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
  document: '.pdf,.xlsx,.xls,.csv,.txt,application/pdf,text/plain,text/csv,application/csv',
} as const;

function isDocumentMime(mimeType: string): boolean {
  return ALLOWED_DOCUMENT_TYPES.includes(mimeType);
}

function documentLabel(attachment: MessageAttachment): string {
  if (attachment.mimeType === 'application/pdf') return 'PDF';
  if (attachment.mimeType.includes('spreadsheet') || attachment.mimeType === 'application/vnd.ms-excel') {
    return 'Excel';
  }
  if (attachment.mimeType === 'text/csv' || attachment.mimeType === 'application/csv') return 'CSV';
  if (attachment.mimeType === 'text/plain') return 'Text';
  return 'File';
}

function documentIcon(attachment: MessageAttachment, size = 18) {
  if (attachment.mimeType === 'application/pdf') return <IconPdf size={size} />;
  if (attachment.mimeType.includes('spreadsheet') || attachment.mimeType === 'application/vnd.ms-excel') {
    return <IconExcel size={size} />;
  }
  return <IconFile size={size} />;
}

function resolveUploadMime(file: File): string | null {
  if (file.type && (ALLOWED_IMAGE_TYPES.includes(file.type) || isDocumentMime(file.type))) {
    return file.type;
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'csv':
      return 'text/csv';
    case 'txt':
      return 'text/plain';
    default:
      return null;
  }
}

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
  onConversationCleared?: () => void;
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
  onExpandImage: (src: string) => void;
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
  onExpandImage,
  onExportPdf,
  onExportExcel,
  shareLabel,
}: MessageRowProps) {
  return (
    <div className={`chat-row ${msg.role}`}>
      <div className={`chat-avatar ${msg.role}`}>
        {msg.role === 'user' ? userName[0]?.toUpperCase() : 'A'}
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
                    title="Download as PDF"
                    aria-label="Download as PDF"
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
        {msg.attachment && (
          <div className="chat-doc-attachment" title={msg.attachment.filename}>
            <span className="chat-doc-icon">{documentIcon(msg.attachment)}</span>
            <span className="chat-doc-meta">
              <span className="chat-doc-type">{documentLabel(msg.attachment)}</span>
              <span className="chat-doc-name">{msg.attachment.filename}</span>
            </span>
            {msg.attachment.data && (
              <button
                type="button"
                className="chat-doc-download-btn"
                onClick={() => downloadAttachment(msg.attachment!)}
              >
                <IconDownload size={14} />
                <span>Download {documentLabel(msg.attachment)}</span>
              </button>
            )}
          </div>
        )}
        {msg.image && (
          <div className="chat-image-wrap">
            <div className="chat-image-frame">
              <button
                type="button"
                className="chat-image-expand-btn"
                onClick={() => onExpandImage(imageSrc(msg.image!))}
                title="Click to enlarge"
                aria-label="Enlarge image"
              >
                <img
                  className="chat-image"
                  src={imageSrc(msg.image)}
                  alt="Chat attachment"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span className="chat-image-zoom-hint">Click to enlarge</span>
              </button>
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
  onConversationCleared,
}: Props) {
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<MessageImage | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingDocument, setPendingDocument] = useState<MessageAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState<CopiedKey>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const messagesCache = useRef<Map<string, Message[]>>(new Map());
  const dragDepthRef = useRef(0);

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
    if (!attachMenuOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!attachMenuRef.current?.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!lightboxImage) return;

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightboxImage]);

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

  const clearPendingDocument = useCallback(() => {
    setPendingDocument(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearPendingFiles = useCallback(() => {
    clearPendingImage();
    clearPendingDocument();
  }, [clearPendingImage, clearPendingDocument]);

  const processUploadFile = useCallback(
    (file: File) => {
      if (guestMode) {
        onSignInRequired?.();
        alert('File upload requires a signed-in account.');
        return;
      }

      if (sending) return;

      const mimeType = resolveUploadMime(file);
      if (!mimeType) {
        alert('Supported files: images, PDF, Excel (.xlsx, .xls), CSV, and text (.txt).');
        clearPendingFiles();
        return;
      }

      if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        if (file.size > MAX_IMAGE_BYTES) {
          alert('Image must be 4 MB or smaller.');
          clearPendingFiles();
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (!base64) return;
          setPendingDocument(null);
          setPendingImage({ mimeType, data: base64 });
          setPendingPreview(result);
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isDocumentMime(mimeType)) {
        if (file.size > MAX_DOCUMENT_BYTES) {
          alert('PDF or Excel file must be 10 MB or smaller.');
          clearPendingFiles();
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (!base64) return;
          setPendingImage(null);
          setPendingPreview(null);
          setPendingDocument({
            mimeType,
            data: base64,
            filename: file.name,
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      alert('Supported files: images, PDF, Excel (.xlsx, .xls), CSV, and text (.txt).');
      clearPendingFiles();
    },
    [guestMode, sending, onSignInRequired, clearPendingFiles]
  );

  const openFilePicker = useCallback(
    (accept: string) => {
      if (guestMode) {
        onSignInRequired?.();
        alert('File upload requires sign in.');
        return;
      }
      const input = fileInputRef.current;
      if (!input) return;
      input.accept = accept;
      input.value = '';
      input.click();
      setAttachMenuOpen(false);
    },
    [guestMode, onSignInRequired]
  );

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processUploadFile(file);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (composerDisabled) return;
    if (!e.dataTransfer.types.includes('Files')) return;

    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (composerDisabled) return;
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (composerDisabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadFile(file);
      focusComposer();
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !pendingImage && !pendingDocument) || sending) return;

    if (guestMode && !guestApiReady) {
      onSignInRequired?.();
      return;
    }

    if (guestMode && guestRemaining <= 0) {
      alert('You have used all 20 free guest messages today from your network. Sign in for unlimited access.');
      onSignInRequired?.();
      return;
    }

    if (guestMode && (pendingImage || pendingDocument)) {
      onSignInRequired?.();
      alert('File upload requires sign in.');
      return;
    }

    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const imageToSend = guestMode ? null : pendingImage;
    const documentToSend = guestMode ? null : pendingDocument;
    const defaultPrompt = documentToSend
      ? `Please analyze "${documentToSend.filename}".`
      : imageToSend
        ? 'Describe this image.'
        : '';
    const now = new Date().toISOString();
    const tempUserMsg: Message = {
      id: 'temp-user',
      conversationId: conversation.id,
      role: 'user',
      content: text || defaultPrompt,
      image: imageToSend,
      attachment: documentToSend,
      createdAt: now,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    clearPendingFiles();

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
        chatMode,
        documentToSend
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
              attachment: result.attachment ?? null,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      } else {
        const updated = await orionApi.messages.list(conversation.id);
        setMessages(updated);
      }

      const titleSource = text || documentToSend?.filename || 'Image chat';
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

  const exportTitle = conversation.title || 'Almahy Chat';

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

  const handleClearChat = () => {
    if (messages.length === 0 || sending) return;
    setShowClearConfirm(true);
  };

  const confirmClearChat = async () => {
    setClearing(true);
    try {
      await orionApi.conversation.clearMessages(conversation.id);
      messagesCache.current.set(conversation.id, []);
      setMessages([]);
      onConversationCleared?.();
      setShowClearConfirm(false);
    } catch {
      alert('Could not clear chat. Try again.');
    } finally {
      setClearing(false);
    }
  };

  const handleNewPdf = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content?.trim());
    if (!lastAssistant?.content) {
      alert('Ask Almahy AI to write your document first, then click New PDF to download it.');
      return;
    }
    const defaultTitle = conversation.title && conversation.title !== 'New Chat' ? conversation.title : 'Almahy Document';
    const title = window.prompt('Name your new PDF:', defaultTitle)?.trim() || defaultTitle;
    setExporting(true);
    try {
      await exportTextToPdf(title, lastAssistant.content);
      flashCopied('new-pdf');
    } catch {
      alert('Could not create PDF. Try again.');
    }
    setExporting(false);
  };

  const handleNewExcel = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content?.trim());
    if (!lastAssistant?.content) {
      alert('Ask Almahy AI to build or edit your spreadsheet first, then click New Excel to download it.');
      return;
    }
    const defaultTitle =
      conversation.title && conversation.title !== 'New Chat' ? conversation.title : 'Almahy Spreadsheet';
    const title = window.prompt('Name your new Excel file:', defaultTitle)?.trim() || defaultTitle;
    setExporting(true);
    try {
      await exportTextToExcel(title, lastAssistant.content);
      flashCopied('new-excel');
    } catch {
      alert('Could not create Excel file. Try again.');
    }
    setExporting(false);
  };

  const handleExportMsgPdf = useCallback(
    async (msg: Message) => {
      try {
        if (msg.role === 'assistant' && msg.content) {
          const title = `${exportTitle}-reply`;
          await exportTextToPdf(title, msg.content);
        } else {
          await exportMessageToPdf(msg, `${exportTitle}-message`);
        }
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
    <div
      className={`chat-panel${dragActive ? ' chat-panel-drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="chat-panel-drop-overlay" aria-hidden="true">
          <div className="chat-panel-drop-card">
            <IconPaperclip size={28} />
            <p>Drop image, PDF, Excel, CSV, or text file here</p>
          </div>
        </div>
      )}
      {messages.length > 0 && (
        <div className="chat-export-bar">
          <button
            type="button"
            className="chat-export-btn compact danger"
            onClick={handleClearChat}
            disabled={sending}
            title="Clear all messages in this chat"
          >
            <span>Clear chat</span>
          </button>
          <button
            type="button"
            className="chat-export-btn compact primary"
            onClick={handleNewPdf}
            disabled={exporting}
            title="Create PDF from the latest Almahy AI reply"
          >
            <IconPdf size={15} />
            <span>{exporting ? 'Creating…' : 'New PDF'}</span>
          </button>
          <button
            type="button"
            className="chat-export-btn compact primary"
            onClick={handleNewExcel}
            disabled={exporting}
            title="Create Excel from the latest Almahy AI reply"
          >
            <IconExcel size={15} />
            <span>{exporting ? 'Creating…' : 'New Excel'}</span>
          </button>
          <button
            type="button"
            className="chat-export-btn compact"
            onClick={handleExportChatPdf}
            disabled={exporting}
            title="Save entire chat as PDF"
          >
            <IconPdf size={15} />
            <span>{exporting ? 'Saving…' : 'Export chat'}</span>
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
                <h2>Ask Almahy AI anything</h2>
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
                <div className="chat-welcome-icon">A</div>
                <h2>Hi! How can I help you today?</h2>
                <p>Chat, learn, build, or create — pick a mode or tap a suggestion below.</p>
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
            onExpandImage={setLightboxImage}
            onExportPdf={handleExportMsgPdf}
            onExportExcel={handleExportMsgExcel}
            shareLabel={shareLabel}
          />
        ))}

        {sending && (
          <div className="chat-row assistant">
            <div className="chat-avatar assistant">A</div>
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

      {lightboxImage && (
        <div
          className="image-lightbox"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged image"
        >
          <button
            type="button"
            className="image-lightbox-close"
            onClick={() => setLightboxImage(null)}
            aria-label="Close"
          >
            ×
          </button>
          <img
            className="image-lightbox-img"
            src={lightboxImage}
            alt="Enlarged view"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
        {pendingDocument && (
          <div className="composer-doc-preview">
            <span className="composer-doc-icon">{documentIcon(pendingDocument, 20)}</span>
            <span className="composer-doc-name">{pendingDocument.filename}</span>
            {pendingDocument.mimeType === 'application/pdf' && (
              <span className="composer-doc-hint">Attach &amp; ask to edit, summarize, or rewrite</span>
            )}
            <button type="button" className="composer-image-remove" onClick={clearPendingDocument} aria-label="Remove file">
              ×
            </button>
          </div>
        )}
        <div className="composer-box">
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            className="composer-file-input"
            onChange={handleFileSelect}
            disabled={sending}
          />
          <div className="composer-attach-wrap" ref={attachMenuRef}>
            <button
              type="button"
              className={`composer-attach${attachMenuOpen ? ' active' : ''}`}
              onClick={() => {
                if (guestMode) {
                  onSignInRequired?.();
                  alert('File upload requires sign in.');
                  return;
                }
                setAttachMenuOpen((open) => !open);
              }}
              disabled={sending}
              aria-label={guestMode ? 'Sign in to attach files' : 'Attach file'}
              title={guestMode ? 'Sign in to attach files' : 'Attach image, PDF, Excel, or other file'}
              aria-expanded={attachMenuOpen}
              aria-haspopup="menu"
            >
              <IconPaperclip size={20} />
            </button>
            {attachMenuOpen && (
              <div className="composer-attach-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => openFilePicker(FILE_PICKER_ACCEPT.all)}>
                  <IconFile size={16} />
                  <span>All files</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openFilePicker(FILE_PICKER_ACCEPT.image)}>
                  <IconImage size={16} />
                  <span>Image</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openFilePicker(FILE_PICKER_ACCEPT.pdf)}>
                  <IconPdf size={16} />
                  <span>PDF</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openFilePicker(FILE_PICKER_ACCEPT.excel)}>
                  <IconExcel size={16} />
                  <span>Excel</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openFilePicker(FILE_PICKER_ACCEPT.document)}>
                  <IconFile size={16} />
                  <span>Documents (PDF, Excel, CSV, TXT)</span>
                </button>
              </div>
            )}
          </div>
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
              (!input.trim() && !pendingImage && !pendingDocument)
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
            : 'Ctrl+Enter to send · Attach or drag image, PDF, Excel, CSV, TXT'}
        </p>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear this chat?"
        message="Remove all messages in this chat? The chat stays in your history but will be empty."
        confirmLabel="Clear chat"
        danger
        loading={clearing}
        onConfirm={confirmClearChat}
        onCancel={() => !clearing && setShowClearConfirm(false)}
      />
    </div>
  );
}
