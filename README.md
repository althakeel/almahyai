# Orion AI

A dedicated Windows desktop AI workspace application with multi-user support, OpenAI and Google Gemini integration.

## Features

- **Windows EXE** — Native desktop app built with Electron
- **Multi-user** — Separate accounts with isolated workspaces, chats, and API keys
- **AI Providers** — Connect OpenAI (GPT-4o, etc.) and Google Gemini models
- **Workspace** — Organize conversations in workspaces with chat history
- **Secure Storage** — API keys encrypted locally with AES-256; passwords hashed with bcrypt
- **Offline-first** — All user data stored locally in SQLite

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- Windows 10/11 (for building the EXE)

## Setup

```bash
npm install
```

## Development

Run the app in development mode:

```bash
npm run electron:dev
```

## Build Windows EXE

```bash
npm run electron:build
```

The installer will be created in the `release/` folder.

## Usage

1. **Create an account** — Each user on this PC gets their own login
2. **Add API keys** — Go to Settings and add your OpenAI and/or Gemini API keys
3. **Start chatting** — Choose a provider (OpenAI or Gemini), pick a model, and start a new chat

## API Keys

| Provider | Where to get your key |
|----------|----------------------|
| OpenAI   | https://platform.openai.com/api-keys |
| Gemini   | https://aistudio.google.com/apikey |

## Data Storage

All data is stored locally per Windows user profile:

- Database: `%APPDATA%/almahy-ai/almahy-ai.db`
- Encryption key: `%APPDATA%/almahy-ai/.key`

Each app user account is separate — switching Windows users gives a fresh app install, and within the app each login has isolated data.

## Project Structure

```
almahy-ai/
├── electron/          # Main process (backend)
│   ├── main.ts        # App entry + IPC handlers
│   ├── preload.ts     # Secure bridge to renderer
│   ├── database.ts    # SQLite + user/auth/storage
│   └── ai-service.ts  # OpenAI & Gemini chat
├── src/               # React frontend (UI)
│   └── components/    # Login, Workspace, Chat, Settings
└── release/           # Built EXE output
```

## License

MIT
