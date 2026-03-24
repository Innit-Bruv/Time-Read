# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimeRead is a single-user, time-aware reading system. Users save content (Substack, Twitter/X threads, articles) then ask "I have 15 minutes" — the system returns a curated reading pack that fits the window. Full spec is in `TimeRead_PRD_v2.md`. Always read it before unfamiliar tasks, especially Section 8 (API Contract) before building any endpoint or frontend data-fetching logic.

## Commands

### Local Dev Infrastructure
```bash
# Start PostgreSQL + Redis (required before running backend)
docker-compose up -d
```

### Backend
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head                                          # Run DB migrations
uvicorn backend.main:app --reload --port 8000                 # Dev server
celery -A backend.tasks.process_content worker --loglevel=info  # Async worker
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # Dev server on port 3000
npm run build
npm run lint
```

### Browser Extension
Load unpacked from `extension/` via `chrome://extensions` with Developer mode enabled. Configure API URL and token in extension settings.

## Architecture

The system has three layers that talk through a single internal API secret:

**Frontend (Next.js 14 App Router + PWA)** — proxies all backend calls through Next.js API routes (`frontend/app/api/`), adding the `Authorization: Bearer` header. NextAuth.js v5 handles single-user magic link auth. The app is a PWA with offline reading support via next-pwa/Workbox.

**Backend (FastAPI + Python)** — all heavy work (extraction, embedding, segmentation) happens at **ingestion time** via Celery tasks, never at recommendation time. Routers in `backend/routers/` are thin; business logic lives in `backend/services/`.

**Database (PostgreSQL + pgvector)** — content is split into timed segments at ingestion. Segments have vector embeddings (OpenAI `text-embedding-3-small`) stored with an HNSW index for semantic search. Reading speed defaults to 200 WPM from the `user_stats` table.

**Content pipeline flow:**
1. `POST /ingest` queues a Celery task
2. `extractor.py` → `segmenter.py` → `embedder.py` process the content
3. `POST /recommend` runs `recommender.py` + `llm_parser.py` to build a pack

## Hard Rules

- Never mix Next.js Pages Router and App Router patterns
- Never use `localStorage` or `sessionStorage`
- All API routes require `Authorization: Bearer <INTERNAL_API_SECRET>`
- Never split segments mid-sentence — always break on paragraph boundaries
- Browser extension must be Manifest V3 only
- PWA share target must use `POST` + `application/x-www-form-urlencoded`
- New files go in `frontend/`, `backend/`, or `extension/` — never in the root

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel (frontend) + Railway (backend)
- Production URL: https://timeread.vercel.app
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app
- Post-deploy health check: https://timeread.vercel.app

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Vercel picks up GitHub push)
- Deploy status: poll production URL
- Health check: https://timeread.vercel.app

## gstack

Use `/browse` from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`
