import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import type { Conversation, Message, MessageImage } from '../types';
import { almahyApi } from '../api/client';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Props {
  conversation: Conversation;
  userName: string;
  simpleMode?: boolean;
  onTitleUpdate: (title: string) => void;
}

function imageSrc(image: MessageImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export default function ChatPanel({ conversation, userName, simpleMode = false, onTitleUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<MessageImage | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    almahyApi.messages.list(conversation.id).then(setMessages);
  }, [conversation.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
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

    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const imageToSend = pendingImage;
    const tempUserMsg: Message = {
      id: 'temp-user',
      conversationId: conversation.id,
      role: 'user',
      content: text || 'Describe this image.',
      image: imageToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    clearPendingImage();

    try {
      await almahyApi.chat.send(
        conversation.id,
        text,
        conversation.provider,
        conversation.model,
        imageToSend
      );

      const updated = await almahyApi.messages.list(conversation.id);
      setMessages(updated);

      const titleSource = text || 'Image chat';
      if (conversation.title === 'New Chat' && titleSource.length > 0) {
        const newTitle = titleSource.slice(0, 40) + (titleSource.length > 40 ? '...' : '');
        await almahyApi.conversation.rename(conversation.id, newTitle);
        onTitleUpdate(newTitle);
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

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && !sending && (
          <div className="chat-welcome">
            <h2>How can I help you today?</h2>
            <p>
              {simpleMode
                ? 'Ask Almahy AI anything — or attach an image for Gemini vision.'
                : `Ask anything — powered by ${conversation.provider === 'openai' ? 'OpenAI' : 'Gemini'}`}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-row ${msg.role}`}>
            <div className={`chat-avatar ${msg.role}`}>
              {msg.role === 'user' ? userName[0]?.toUpperCase() : 'A'}
            </div>
            <div className="chat-bubble">
              <div className="chat-role">{msg.role === 'user' ? 'You' : 'Almahy AI'}</div>
              {msg.image && (
                <img className="chat-image" src={imageSrc(msg.image)} alt="Uploaded" />
              )}
              {msg.content && <div className="chat-text">{msg.content}</div>}
            </div>
          </div>
        ))}

        {sending && (
          <div className="chat-row assistant">
            <div className="chat-avatar assistant">A</div>
            <div className="chat-bubble">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-composer">
        {pendingPreview && (
          <div className="composer-image-preview">
            <img src={pendingPreview} alt="Selected" />
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
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach image"
            title="Attach image"
          >
            🖼
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message Almahy AI..."
            rows={1}
            disabled={sending}
          />
          <button
            type="button"
            className="composer-send"
            onClick={handleSend}
            disabled={sending || (!input.trim() && !pendingImage)}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        <p className="composer-hint">Attach an image to analyze it with Gemini. Max 4 MB.</p>
      </div>
    </div>
  );
}
