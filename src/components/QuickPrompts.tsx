import type { QuickPrompt } from '../config/chatModes';

interface Props {
  prompts: QuickPrompt[];
  onSelect: (prompt: QuickPrompt) => void;
}

export default function QuickPrompts({ prompts, onSelect }: Props) {
  return (
    <div className="quick-prompts">
      <p className="quick-prompts-label">Try asking</p>
      <div className="quick-prompts-grid">
        {prompts.map((p) => (
          <button key={p.id} type="button" className="quick-prompt-card" onClick={() => onSelect(p)}>
            <span className="quick-prompt-icon">{p.icon}</span>
            <span className="quick-prompt-title">{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
