# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup (install deps + Prisma generate + migrate)
npm run setup

# Development server (Turbopack)
npm run dev

# Run all tests (Vitest + jsdom)
npm test

# Run a single test file
npx vitest src/components/chat/__tests__/ChatInterface.test.tsx

# Lint
npm run lint

# Database management
npx prisma migrate dev     # Run new migrations
npx prisma generate        # Regenerate Prisma client after schema changes
npm run db:reset           # Wipe and re-run all migrations
```

The `dev` script requires `node-compat.cjs` via `NODE_OPTIONS`; this is handled automatically by the npm script.

## Architecture

UIGen is an AI-powered React component generator. Users describe components in chat; the AI writes code into a **virtual file system** (no disk writes); generated files are compiled in-browser and rendered live in an iframe.

### Data flow

1. User sends a message → `ChatInterface` → `POST /api/chat/route.ts`
2. The API reconstructs a `VirtualFileSystem` from serialized file data sent by the client, then calls the language model (real Claude or `MockLanguageModel`) with two tools:
   - `str_replace_editor` – create, str_replace, insert, view files
   - `file_manager` – rename, delete files
3. Tool calls stream back to the client → `FileSystemContext.handleToolCall` updates the VFS and triggers a `refreshTrigger` increment
4. `PreviewFrame` reacts to `refreshTrigger`: it calls `createImportMap` (Babel standalone transforms JSX/TSX → blob URLs, resolves imports), then writes the resulting HTML to `iframe.srcdoc`
5. For authenticated users, `onFinish` in the API route persists both messages and serialized file system data to SQLite via Prisma

### Key files

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Streaming AI endpoint; reconstructs VFS, calls model, persists on finish |
| `src/lib/file-system.ts` | `VirtualFileSystem` class – in-memory tree with CRUD + str-replace methods |
| `src/lib/contexts/file-system-context.tsx` | `FileSystemProvider` – client-side VFS state + `handleToolCall` dispatcher |
| `src/lib/contexts/chat-context.tsx` | `ChatProvider` – Vercel AI SDK `useChat` wrapper |
| `src/lib/transform/jsx-transformer.ts` | Babel transform, import map builder, preview HTML generator |
| `src/lib/provider.ts` | `getLanguageModel()` – returns real `anthropic()` or `MockLanguageModel` |
| `src/lib/prompts/generation.tsx` | System prompt sent to the AI |
| `src/lib/tools/str-replace.ts` | Builds the `str_replace_editor` tool (Vercel AI SDK tool schema) |
| `src/lib/tools/file-manager.ts` | Builds the `file_manager` tool |
| `src/lib/auth.ts` | JWT sessions via `jose` (custom, no NextAuth) |
| `src/app/main-content.tsx` | Root layout: resizable chat panel + preview/code panel |

### Virtual file system

`VirtualFileSystem` is a pure in-memory structure. Files are stored in a `Map<string, FileNode>` keyed by absolute paths (always starting with `/`). The class is serialized to plain JSON for network transfer and Prisma storage. The client and server each reconstruct independent instances per request.

### Preview pipeline

`createImportMap` in `jsx-transformer.ts`:
- Transforms `.js/.jsx/.ts/.tsx` files with Babel standalone
- Converts each to a blob URL and adds entries to an ES module import map
- Third-party imports (non-relative, non-`@/`) are mapped to `https://esm.sh/<package>`
- Missing local imports get auto-generated placeholder modules to avoid hard failures
- The resulting `<script type="importmap">` + entry-point `import()` are written into `iframe.srcdoc`

Tailwind CSS is loaded via CDN (`https://cdn.tailwindcss.com`) inside the iframe.

### AI rules for generated code

The system prompt (`src/lib/prompts/generation.tsx`) enforces:
- Every project must have `/App.jsx` as the root entry point with a default export
- Style with Tailwind CSS only (no inline styles)
- Local imports use the `@/` alias (e.g., `import Foo from '@/components/Foo'`)
- No HTML files

### Auth

Custom JWT-based auth (`src/lib/auth.ts`). Sessions stored in `auth-token` HttpOnly cookie (7-day expiry). Passwords hashed with `bcrypt`. Anonymous users can generate components without signing in; their work is tracked in `sessionStorage` via `src/lib/anon-work-tracker.ts` and can be saved on sign-up.

### Database

Prisma with SQLite (`prisma/dev.db`). Two models: `User` and `Project`. Project stores `messages` (JSON array of chat messages) and `data` (serialized VFS). Prisma client is generated into `src/generated/prisma` (non-default location).

### Mock provider

When `ANTHROPIC_API_KEY` is absent or empty, `getLanguageModel()` returns `MockLanguageModel`, which deterministically generates Counter/ContactForm/Card component code without hitting the API. `maxSteps` is reduced to 4 in mock mode.
