import type { ChatMode } from '../config/chatModes';
import { CHAT_MODES } from '../config/chatModes';

interface Props {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export default function ChatModeBar({ mode, onChange, disabled }: Props) {
  return (
    <div className="chat-mode-bar">
      {CHAT_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`chat-mode-btn${mode === m.id ? ' active' : ''}`}
          onClick={() => onChange(m.id)}
          disabled={disabled}
          title={m.hint}
        >
          <span>{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}
