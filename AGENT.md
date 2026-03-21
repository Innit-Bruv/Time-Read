# TimeRead — Agent Instructions

## Project Overview
TimeRead is a single-user, time-aware reading app. Full spec is in PRD.md.
Always read PRD.md before starting any task if you are unfamiliar with the project.

---

## Mandatory Skill Usage

You MUST invoke the relevant skill before starting any task in that domain.
Do not proceed without loading the skill first.

| When working on...                              | Load this skill first             |
|-------------------------------------------------|-----------------------------------|
| React components, Next.js pages, App Router     | @react-patterns                   |
| TypeScript types, schemas, interfaces           | @typescript-expert                |
| pgvector queries, embeddings, similarity search | @rag-engineer                     |
| PWA manifest, service worker, iOS share sheet   | @pwa                              |
| Vercel config, deployment, env vars             | @vercel-deployment                |
| FastAPI routes, backend, Railway                | @docker-expert                    |
| Auth middleware, API secrets, headers           | @api-security-best-practices      |
| Any new feature from scratch                    | @react-patterns + @typescript-expert |

---

## Stack
- Frontend: Next.js 14 App Router, React, TypeScript, Tailwind, next-pwa
- Backend: Python, FastAPI, PostgreSQL + pgvector, Celery, Redis
- Auth: NextAuth.js v5, magic link
- AI: OpenAI text-embedding-3-small (embeddings), gpt-4o-mini (query parsing)
- Hosting: Vercel (frontend), Railway (backend)

---

## Hard Rules

- Never mix Pages Router and App Router patterns
- Never use localStorage or sessionStorage
- All API routes require `Authorization: Bearer <INTERNAL_API_SECRET>` header
- All heavy processing (extraction, embedding, segmentation) happens at ingestion time, never at recommendation time
- Never split segments mid-sentence — always break on paragraph boundaries
- reading_speed default is 200 wpm, pulled from user_stats table
- Browser extension must be Manifest V3 only
- PWA share target must use POST + application/x-www-form-urlencoded

---

## Folder Structure
Always place new files in the correct location per the repo structure in PRD.md.
- Frontend code → frontend/
- Backend code → backend/
- Extension code → extension/

---

## When in Doubt
Check PRD.md Section 8 (API Contract) for exact request/response shapes before
building any endpoint or frontend data-fetching logic.
