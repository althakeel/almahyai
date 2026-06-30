import { useState, useEffect } from 'react';
import { orionApi } from '../api/client';

export default function Settings() {
  const [geminiKey, setGeminiKey] = useState('');
  const [chatgptKey, setChatgptKey] = useState('');
  const [githubKey, setGithubKey] = useState('');
  const [hasGemini, setHasGemini] = useState(false);
  const [hasChatgpt, setHasChatgpt] = useState(false);
  const [hasGithub, setHasGithub] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingChatgpt, setTestingChatgpt] = useState(false);
  const [testingGithub, setTestingGithub] = useState(false);
  const [geminiTest, setGeminiTest] = useState<{ valid: boolean; error?: string } | null>(null);
  const [chatgptTest, setChatgptTest] = useState<{ valid: boolean; error?: string } | null>(null);
  const [githubTest, setGithubTest] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const refreshStatus = async () => {
    const status = await orionApi.keys.status();
    setHasGemini(status.hasGemini);
    setHasChatgpt(status.hasOpenai);
    setHasGithub(status.hasGithub || status.hasCopilot);
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleSave = async () => {
    await orionApi.keys.save(
      chatgptKey.trim() || null,
      geminiKey.trim() || null,
      githubKey.trim() || null
    );
    await refreshStatus();
    setGeminiKey('');
    setChatgptKey('');
    setGithubKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestGemini = async () => {
    if (!geminiKey) return;
    setTestingGemini(true);
    setGeminiTest(await orionApi.keys.testGemini(geminiKey));
    setTestingGemini(false);
  };

  const handleTestChatgpt = async () => {
    if (!chatgptKey) return;
    setTestingChatgpt(true);
    setChatgptTest(await orionApi.keys.testOpenai(chatgptKey));
    setTestingChatgpt(false);
  };

  const handleTestGithub = async () => {
    if (!githubKey) return;
    setTestingGithub(true);
    setGithubTest(await orionApi.keys.testGithub(githubKey));
    setTestingGithub(false);
  };

  const allConnected = hasGemini && hasChatgpt && hasGithub;
  const engineCount = [hasGemini, hasChatgpt, hasGithub].filter(Boolean).length;

  return (
    <div className="settings-panel">
      <h2>AI Engine Settings</h2>
      <p className="admin-badge">
        Admin only — connect Gemini, ChatGPT, and GitHub Copilot. Almahy merges all three for every chat answer.
      </p>

      <div className={`key-status ${engineCount >= 2 ? 'connected' : 'disconnected'}`} style={{ marginBottom: 24 }}>
        {allConnected
          ? '● Gemini + ChatGPT + Copilot connected — triple-engine merge active'
          : engineCount >= 2
            ? `● ${engineCount}/3 engines connected — merge active (add all 3 for best accuracy)`
            : engineCount === 1
              ? '● 1 engine connected — add more keys to enable merge'
              : '○ No AI engines configured yet'}
      </div>

      <div className="settings-section">
        <h3>Gemini API Key</h3>
        <p>
          Get a free key from{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Google AI Studio
          </a>
          . Powers chat, web search, and document reading.
        </p>
        <div className="key-input-group">
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={hasGemini ? '•••••••••••••••• (saved — paste to replace)' : 'Paste Gemini API key…'}
          />
          <button className="btn-secondary" onClick={handleTestGemini} disabled={!geminiKey || testingGemini}>
            {testingGemini ? 'Testing…' : 'Test'}
          </button>
        </div>
        {geminiTest !== null && (
          <p style={{ color: geminiTest.valid ? 'var(--success)' : 'var(--error)', marginTop: 8 }}>
            {geminiTest.valid ? 'Gemini key is valid' : (geminiTest.error ?? 'Invalid key')}
          </p>
        )}
      </div>

      <div className="settings-section">
        <h3>ChatGPT API Key (OpenAI)</h3>
        <p>
          Get a key from{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
            OpenAI Platform
          </a>
          . Powers ChatGPT answers and HD photorealistic images (DALL-E 3).
        </p>
        <div className="key-input-group">
          <input
            type="password"
            value={chatgptKey}
            onChange={(e) => setChatgptKey(e.target.value)}
            placeholder={hasChatgpt ? '•••••••••••••••• (saved — paste to replace)' : 'Paste ChatGPT / OpenAI API key…'}
          />
          <button className="btn-secondary" onClick={handleTestChatgpt} disabled={!chatgptKey || testingChatgpt}>
            {testingChatgpt ? 'Testing…' : 'Test'}
          </button>
        </div>
        {chatgptTest !== null && (
          <p style={{ color: chatgptTest.valid ? 'var(--success)' : 'var(--error)', marginTop: 8 }}>
            {chatgptTest.valid ? 'ChatGPT key is valid' : (chatgptTest.error ?? 'Invalid key')}
          </p>
        )}
      </div>

      <div className="settings-section">
        <h3>GitHub Copilot / Models Token</h3>
        <p>
          Create a token at{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
            GitHub Settings → Tokens
          </a>{' '}
          (enable <strong>models</strong> scope), or use{' '}
          <a href="https://github.com/marketplace/models" target="_blank" rel="noopener noreferrer">
            GitHub Models
          </a>
          . This connects Microsoft Copilot-style models as the third engine.
        </p>
        <div className="key-input-group">
          <input
            type="password"
            value={githubKey}
            onChange={(e) => setGithubKey(e.target.value)}
            placeholder={hasGithub ? '•••••••••••••••• (saved — paste to replace)' : 'Paste GitHub token…'}
          />
          <button className="btn-secondary" onClick={handleTestGithub} disabled={!githubKey || testingGithub}>
            {testingGithub ? 'Testing…' : 'Test'}
          </button>
        </div>
        {githubTest !== null && (
          <p style={{ color: githubTest.valid ? 'var(--success)' : 'var(--error)', marginTop: 8 }}>
            {githubTest.valid ? 'GitHub Copilot Models token is valid' : (githubTest.error ?? 'Invalid token')}
          </p>
        )}
      </div>

      <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={handleSave}>
        {saved ? 'Saved!' : 'Save API Keys'}
      </button>

      <div className="settings-section" style={{ marginTop: 40 }}>
        <h3>How triple-engine merge works</h3>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Every chat message</strong> → Gemini, ChatGPT, and Copilot answer in parallel</li>
          <li><strong>Almahy AI merges</strong> → one accurate final answer (drops mistakes & contradictions)</li>
          <li><strong>Realistic photos</strong> → DALL-E 3 HD when OpenAI key is saved</li>
          <li>Needs at least <strong>2 of 3 keys</strong> for merge; <strong>all 3</strong> for best accuracy</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Or add keys in <code>backend/.env</code>: <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>,{' '}
          <code>GITHUB_MODELS_TOKEN</code>, then <code>pm2 restart almahyai-api</code>
        </p>
      </div>
    </div>
  );
}
