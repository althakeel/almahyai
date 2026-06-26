import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import type { Conversation, Message } from '../types';
import { almahyApi } from '../api/client';

interface Props {
  conversation: Conversation;
  userName: string;
  simpleMode?: boolean;
  onTitleUpdate: (title: string) => void;
}

export default function ChatPanel({ conversation, userName, simpleMode = false, onTitleUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    almahyApi.messages.list(conversation.id).then(setMessages);
  }, [conversation.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const tempUserMsg: Message = {
      id: 'temp-user',
      conversationId: conversation.id,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      await almahyApi.chat.send(
        conversation.id,
        text,
        conversation.provider,
        conversation.model
      );

      const updated = await almahyApi.messages.list(conversation.id);
      setMessages(updated);

      if (conversation.title === 'New Chat' && text.length > 0) {
        const newTitle = text.slice(0, 40) + (text.length > 40 ? '...' : '');
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
            <p>{simpleMode ? 'Ask Almahy AI anything.' : `Ask anything — powered by ${conversation.provider === 'openai' ? 'OpenAI' : 'Gemini'}`}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-row ${msg.role}`}>
            <div className={`chat-avatar ${msg.role}`}>
              {msg.role === 'user' ? userName[0]?.toUpperCase() : 'A'}
            </div>
            <div className="chat-bubble">
              <div className="chat-role">{msg.role === 'user' ? 'You' : 'Almahy AI'}</div>
              <div className="chat-text">{msg.content}</div>
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
        <div className="composer-box">
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
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        <p className="composer-hint">Almahy AI can make mistakes. Check important info.</p>
      </div>
    </div>
  );
}
