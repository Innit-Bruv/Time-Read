# TimeRead — Personal Time-Aware Reading System

A single-user web app that saves reading content from Substack, Twitter/X, and articles, then surfaces them as time-optimized reading packs.

**"I have 15 minutes"** → system returns a curated reading pack that fits exactly within that window.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, PostgreSQL + pgvector |
| Async Tasks | Celery + Redis |
| AI | OpenAI text-embedding-3-small (embeddings), GPT-4o-mini (query parsing) |
| Auth | NextAuth.js v5 (magic link) |
| Hosting | Vercel (frontend), Railway (backend) |

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env .env.local  # fill in your values

# Run migrations (requires PostgreSQL with pgvector)
alembic upgrade head

# Start server
uvicorn backend.main:app --reload --port 8000

# Start Celery worker (optional, for async processing)
celery -A backend.tasks.process_content worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local  # fill in your values
npm run dev
```

### Browser Extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` folder
4. Click the extension icon → Settings → paste your API URL and token

## Project Structure

```
├── backend/                    # FastAPI app
│   ├── main.py                # App entry point
│   ├── auth.py                # Bearer token middleware
│   ├── routers/               # API endpoints
│   │   ├── ingest.py          # POST /ingest
│   │   ├── recommend.py       # POST /recommend
│   │   ├── archive.py         # GET /archive
│   │   └── session.py         # POST /session/track, GET segments
│   ├── services/              # Business logic
│   │   ├── extractor.py       # URL → clean text
│   │   ├── segmenter.py       # Text → timed segments
│   │   ├── embedder.py        # OpenAI embeddings
│   │   ├── recommender.py     # Pack generation
│   │   └── llm_parser.py      # NL query parsing
│   ├── models/                # Data models
│   │   ├── content.py         # SQLAlchemy ORM
│   │   └── schemas.py         # Pydantic schemas
│   ├── db/                    # Database
│   │   ├── database.py        # Connection
│   │   └── migrations/        # Alembic
│   └── tasks/                 # Celery tasks
│       └── process_content.py
├── frontend/                   # Next.js app
│   ├── app/                   # App Router pages
│   ├── components/            # React components
│   └── lib/                   # API client, auth
├── extension/                  # Chrome MV3
│   ├── manifest.json
│   ├── background.js
│   ├── popup/
│   └── twitter_import.js
└── README.md
```

## API Endpoints

All routes require `Authorization: Bearer <INTERNAL_API_SECRET>`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Save a new URL for processing |
| GET | `/content/{id}/status` | Poll processing status |
| POST | `/recommend` | Generate a reading pack |
| GET | `/archive` | Browse saved content |
| GET | `/content/{id}/segment/{id}` | Fetch segment text |
| POST | `/session/track` | Record reading progress |
| GET | `/health` | Health check |

## Environment Variables

See `backend/.env` and `frontend/.env.local` for required variables.
