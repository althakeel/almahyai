import type { ChatMode } from '../config/chatModes';
import { CHAT_MODES } from '../config/chatModes';

interface Props {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export default function ChatModeBar({ mode, onChange, disabled }: Props) {
  const active = CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];

  return (
    <div className="chat-mode-bar-wrap">
      <div className="chat-mode-bar">
        {CHAT_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chat-mode-btn${mode === m.id ? ' active' : ''}`}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            title={m.description}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <p className="chat-mode-hint">{active.hint}</p>
    </div>
  );
}
