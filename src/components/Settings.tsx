import { useState, useEffect } from 'react';
import { orionApi } from '../api/client';

export default function Settings() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [status, setStatus] = useState({ hasOpenai: false, hasGemini: false });
  const [testing, setTesting] = useState<'openai' | 'gemini' | null>(null);
  const [testResult, setTestResult] = useState<{ openai?: { valid: boolean; error?: string }; gemini?: { valid: boolean; error?: string } }>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    orionApi.keys.status().then(setStatus);
  }, []);

  const handleSave = async () => {
    await orionApi.keys.save(
      openaiKey.trim() || null,
      geminiKey.trim() || null
    );
    const newStatus = await orionApi.keys.status();
    setStatus(newStatus);
    setOpenaiKey('');
    setGeminiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestOpenai = async () => {
    if (!openaiKey) return;
    setTesting('openai');
    const result = await orionApi.keys.testOpenai(openaiKey);
    setTestResult((prev) => ({ ...prev, openai: result }));
    setTesting(null);
  };

  const handleTestGemini = async () => {
    if (!geminiKey) return;
    setTesting('gemini');
    const result = await orionApi.keys.testGemini(geminiKey);
    setTestResult((prev) => ({ ...prev, gemini: result }));
    setTesting(null);
  };

  return (
    <div className="settings-panel">
      <h2>API Settings</h2>
      <p className="admin-badge">
        Admin only — when you save Gemini or OpenAI keys here, every user can chat with Orion AI instantly.
      </p>

      <div className="settings-section">
        <h3>OpenAI API Key</h3>
        <p>Connect your OpenAI account. Get your key from platform.openai.com</p>
        <div className="key-input-group">
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={status.hasOpenai ? '•••••••••••••••• (key saved)' : 'sk-...'}
          />
          <button className="btn-secondary" onClick={handleTestOpenai} disabled={!openaiKey || testing === 'openai'}>
            {testing === 'openai' ? 'Testing...' : 'Test'}
          </button>
        </div>
        <div className={`key-status ${status.hasOpenai ? 'connected' : 'disconnected'}`}>
          {status.hasOpenai ? '● Connected' : '○ Not configured'}
          {testResult.openai !== undefined && (
            <span style={{ marginLeft: 8, color: testResult.openai.valid ? 'var(--success)' : 'var(--error)' }}>
              {testResult.openai.valid ? '— Valid key' : `— ${testResult.openai.error ?? 'Invalid key'}`}
            </span>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3>Google Gemini API Key</h3>
        <p>
          Paste your key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a>.
          New keys start with <code>AQ.</code> — that is normal.
        </p>
        <div className="key-input-group">
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={status.hasGemini ? '•••••••••••••••• (key saved)' : 'AQ. or AIza...'}
          />
          <button className="btn-secondary" onClick={handleTestGemini} disabled={!geminiKey || testing === 'gemini'}>
            {testing === 'gemini' ? 'Testing...' : 'Test'}
          </button>
        </div>
        <div className={`key-status ${status.hasGemini ? 'connected' : 'disconnected'}`}>
          {status.hasGemini ? '● Connected' : '○ Not configured'}
          {testResult.gemini !== undefined && (
            <span style={{ marginLeft: 8, color: testResult.gemini.valid ? 'var(--success)' : 'var(--error)' }}>
              {testResult.gemini.valid ? '— Valid key' : `— ${testResult.gemini.error ?? 'Invalid key'}`}
            </span>
          )}
        </div>
      </div>

      <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={handleSave}>
        {saved ? 'Saved!' : 'Save API Keys'}
      </button>

      <div className="settings-section" style={{ marginTop: 40 }}>
        <h3>About</h3>
        <p>Orion AI v1.0.3 — Admin panel for API configuration.</p>
        <p style={{ marginTop: 8 }}>
          Only the admin can manage API keys. All users chat through Orion AI using these keys.
        </p>
      </div>
    </div>
  );
}
