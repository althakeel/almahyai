interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="almahy-modal-backdrop" onClick={loading ? undefined : onCancel} role="presentation">
      <div
        className="almahy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="almahy-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="almahy-modal-brand">
          <div className="logo-mark modal-logo">A</div>
          <span>Almahy AI</span>
        </div>
        <h2 id="almahy-modal-title" className="almahy-modal-title">
          {title}
        </h2>
        <p className="almahy-modal-message">{message}</p>
        <div className="almahy-modal-actions">
          <button type="button" className="almahy-modal-btn secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`almahy-modal-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
