import { memo, useEffect, useRef, useState } from 'react';

interface Props {
  content: string;
  isAssistant?: boolean;
}

function MarkdownMessage({ content, isAssistant = false }: Props) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    import('marked').then(({ marked }) => {
      marked.setOptions({ breaks: true, gfm: true });
      const rendered = marked.parse(content) as string;
      if (!cancelled) setHtml(rendered);
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isAssistant) return;

    const blocks = container.querySelectorAll('pre');
    blocks.forEach((pre, index) => {
      if (pre.querySelector('.code-copy-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.title = 'Copy code';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        try {
          await navigator.clipboard.writeText(code);
          setCopiedBlock(index);
          btn.textContent = 'Copied!';
          window.setTimeout(() => {
            setCopiedBlock(null);
            btn.textContent = 'Copy';
          }, 1500);
        } catch {
          btn.textContent = 'Failed';
        }
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }, [html, isAssistant, copiedBlock]);

  if (!isAssistant) {
    return <div className="chat-text">{content}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="chat-text markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default memo(MarkdownMessage);
