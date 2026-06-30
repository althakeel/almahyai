import { useState, useEffect } from 'react';
import { orionApi } from '../api/client';

export default function Settings() {
  const [geminiKey, setGeminiKey] = useState('');
  const [chatgptKey, setChatgptKey] = useState('');
  const [hasGemini, setHasGemini] = useState(false);
  const [hasChatgpt, setHasChatgpt] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingChatgpt, setTestingChatgpt] = useState(false);
  const [geminiTest, setGeminiTest] = useState<{ valid: boolean; error?: string } | null>(null);
  const [chatgptTest, setChatgptTest] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const refreshStatus = async () => {
    const status = await orionApi.keys.status();
    setHasGemini(status.hasGemini);
    setHasChatgpt(status.hasOpenai);
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleSave = async () => {
    await orionApi.keys.save(
      chatgptKey.trim() || null,
      geminiKey.trim() || null
    );
    await refreshStatus();
    setGeminiKey('');
    setChatgptKey('');
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

  const allConnected = hasGemini && hasChatgpt;

  return (
    <div className="settings-panel">
      <h2>AI Engine Settings</h2>
      <p className="admin-badge">
        Admin only — connect Gemini and ChatGPT so all users get Almahy AI with every engine.
      </p>

      <div className={`key-status ${allConnected ? 'connected' : hasGemini || hasChatgpt ? 'connected' : 'disconnected'}`} style={{ marginBottom: 24 }}>
        {allConnected
          ? '● Gemini + ChatGPT connected'
          : hasGemini
            ? '● Gemini connected — add ChatGPT key below'
            : hasChatgpt
              ? '● ChatGPT connected — add Gemini key below'
              : '○ No AI engines configured yet'}
      </div>

      <div className="settings-section">
        <h3>Gemini API Key</h3>
        <p>
          Get a free key from{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Google AI Studio
          </a>
          . Powers chat, web search, and backup images.
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
          . Powers ChatGPT-style answers and HD photorealistic images (same DALL-E 3 engine as ChatGPT).
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

      <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={handleSave}>
        {saved ? 'Saved!' : 'Save API Keys'}
      </button>

      <div className="settings-section" style={{ marginTop: 40 }}>
        <h3>How it works</h3>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Chat / Learn / Create</strong> → uses Gemini (web search + chat)</li>
          <li><strong>Build (code)</strong> → uses ChatGPT when the OpenAI key is saved</li>
          <li><strong>Realistic photos</strong> → uses ChatGPT DALL-E 3 HD when OpenAI key is saved (best quality)</li>
          <li>With both keys, Almahy AI is connected to all major AI engines</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Or add keys on the AWS server in <code>backend/.env</code>: <code>GEMINI_API_KEY</code> and{' '}
          <code>OPENAI_API_KEY</code>, then restart: <code>pm2 restart almahyai-api</code>
        </p>
      </div>
    </div>
  );
}
