# TODOS

## TODO-001: Re-extract existing articles to Markdown
**What:** Add a "Re-extract" button per archive item to re-run the pipeline with Markdown output.
**Why:** Articles saved before the Markdown change render as plain text in the reader. Users can't benefit from the rich reader without re-ingesting.
**Pros:** Existing library gets Markdown formatting without manual re-ingest.
**Cons:** Requires a new backend endpoint + UI; triggers re-extraction which costs API credits for embedding.
**Context:** extractor.py was updated to output Markdown (include_formatting=True). Existing segments.text is plain text. react-markdown renders plain text fine but loses formatting/images. When tackling this: add POST /content/{id}/reextract backend route that re-runs run_pipeline() on the existing content_id, overwriting segments.
**Depends on:** Markdown reader (this PR)
**Effort:** S (human: ~4h / CC: ~20min) | Priority: P2

## TODO-002: Offline pre-caching for reading sessions
**What:** When the user clicks "Begin Session", pre-fetch and cache all segment texts in the browser's Cache API.
**Why:** Users could read articles without internet after the initial load (Kindle-style).
**Pros:** Core value prop — time-aware reading anywhere.
**Cons:** Caching large text payloads; service worker setup is already in place via next-pwa.
**Context:** next-pwa is installed and configured. The Reader component knows all segment IDs at session start. Use the Cache API directly in Reader.tsx: `caches.open('session').then(cache => cache.addAll(segmentUrls))`. The service worker's StaleWhileRevalidate strategy for /api/ routes handles the rest.
**Depends on:** PWA fix (this PR)
**Effort:** S (human: ~4h / CC: ~20min) | Priority: P3
