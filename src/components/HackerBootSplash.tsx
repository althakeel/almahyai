import { useEffect, useState, useRef, useCallback } from 'react';

const BOOT_LINES = [
  '> Starting Orion AI...',
  '> Loading modules...',
  '> Checking connection...',
];

const MIN_BOOT_MS = 500;
const MAX_BOOT_MS = 2500;

interface Props {
  ready: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function HackerBootSplash({ ready, onComplete, onSkip }: Props) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'boot' | 'wait' | 'exit'>('boot');
  const [minTimeDone, setMinTimeDone] = useState(false);
  const finishingRef = useRef(false);
  const completeTimerRef = useRef<number | null>(null);

  const finishSplash = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setProgress(100);
    setPhase('exit');
    completeTimerRef.current = window.setTimeout(onComplete, 200);
  }, [onComplete]);

  useEffect(() => {
    return () => {
      if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinTimeDone(true), MIN_BOOT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(finishSplash, MAX_BOOT_MS);
    return () => window.clearTimeout(timer);
  }, [finishSplash]);

  useEffect(() => {
    let index = 0;
    const interval = window.setInterval(() => {
      if (index >= BOOT_LINES.length) {
        window.clearInterval(interval);
        return;
      }
      setVisibleLines((prev) => [...prev, BOOT_LINES[index]]);
      setProgress(Math.round(((index + 1) / BOOT_LINES.length) * 90));
      index += 1;
    }, 180);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (visibleLines.length >= BOOT_LINES.length && !ready && phase === 'boot') {
      setPhase('wait');
    }
  }, [visibleLines.length, ready, phase]);

  useEffect(() => {
    if (minTimeDone && ready) {
      finishSplash();
    }
  }, [minTimeDone, ready, finishSplash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  return (
    <div className="hacker-boot">
      <div className="hacker-matrix-css" aria-hidden="true" />
      <div className="hacker-boot-scanlines" aria-hidden="true" />
      <div className="hacker-boot-vignette" aria-hidden="true" />

      <div className="hacker-boot-content">
        <div className="hacker-logo-block hacker-fade-in">
          <div className="hacker-logo-mark hacker-pulse">O</div>
          <h1 className="hacker-title">
            <span className="glitch" data-text="ORION AI">
              ORION AI
            </span>
          </h1>
          <p className="hacker-subtitle">SECURE NEURAL WORKSPACE</p>
        </div>

        <div className="hacker-terminal">
          <div className="hacker-terminal-header">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
            <span>system://orion/boot</span>
          </div>
          <div className="hacker-terminal-body">
            {visibleLines.map((line, i) => (
              <div key={line} className="hacker-line hacker-line-in">
                {line}
                {i === visibleLines.length - 1 && phase === 'boot' && (
                  <span className="hacker-cursor">_</span>
                )}
              </div>
            ))}
            {phase === 'wait' && (
              <div className="hacker-line wait hacker-blink">
                {'> Connecting...'}
                <span className="hacker-cursor">_</span>
              </div>
            )}
            {phase === 'exit' && (
              <div className="hacker-line success hacker-fade-in">
                {'> Ready'}
              </div>
            )}
          </div>
        </div>

        <div className="hacker-progress-wrap">
          <div className="hacker-progress-label">
            <span>SYSTEM INIT</span>
            <span>{progress}%</span>
          </div>
          <div className="hacker-progress-track">
            <div className="hacker-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button type="button" className="boot-skip-btn" onClick={onSkip}>
          Skip intro · Enter
        </button>
      </div>
    </div>
  );
}
