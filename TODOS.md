# TODOS

## TODO-001: Re-extract existing articles to Markdown
**What:** Add a "Re-extract" button per archive item to re-run the pipeline with Markdown output.
**Why:** Articles saved before the Markdown change render as plain text in the reader. Users can't benefit from the rich reader without re-ingesting.
**Pros:** Existing library gets Markdown formatting without manual re-ingest.
**Cons:** Requires a new backend endpoint + UI; triggers re-extraction which costs API credits for embedding.
**Context:** extractor.py was updated to output Markdown (include_formatting=True). Existing segments.text is plain text. react-markdown renders plain text fine but loses formatting/images. When tackling this: add POST /content/{id}/reextract backend route that re-runs run_pipeline() on the existing content_id, overwriting segments. Also: existing content has cover_image=null and publish_date=null — re-extraction will populate these too.
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

## TODO-003: Reading skeleton / shimmer loading state
**What:** Replace the "Loading…" text in the Reader with a Substack-style skeleton — pulsing placeholder lines that fill the article column while segment text fetches.
**Why:** The current uppercase "Loading…" text feels jarring. A skeleton preserves layout and signals content is coming.
**Pros:** Dramatically improves perceived performance; consistent with the Substack feel established by this PR.
**Cons:** Minimal — pure CSS animation + conditional render.
**Context:** In Reader.tsx, the `loading` state currently renders `<div>Loading…</div>`. Replace with a skeleton component: 3-4 lines at ~80% width, 1-2 at ~60%, pulsing with a CSS animation. Newsreader font placeholder lines.
**Depends on:** Substack reader overhaul (cover_image PR)
**Effort:** S (human: ~2h / CC: ~10min) | Priority: P3

## TODO-004: Archive page thumbnail grid
**What:** Show article cover images as small thumbnails next to each title in the archive list.
**Why:** Now that `cover_image` is stored in the Content model, the archive can display it. Makes the reading list feel like a real app (Pocket, Instapaper, Readwise) rather than a plain list.
**Pros:** Immediate visual upgrade to the archive; leverages the cover_image work from this PR at near-zero marginal cost.
**Cons:** Articles ingested before this PR have no cover_image — they'll show a placeholder or no thumbnail.
**Context:** Archive page is at `frontend/app/archive/page.tsx`. The API response from GET /archive (or whatever lists content) needs to include `cover_image`. Add a thumbnail column to the list: `<img src={cover_image} className="w-12 h-12 rounded object-cover" />` with a gray placeholder on null.
**Depends on:** cover_image column + Substack reader PR
**Effort:** S (human: ~3h / CC: ~15min) | Priority: P2

## TODO-005: Reading progress pill accessibility
**What:** Add `aria-label="Reading progress: X%, Y minutes remaining"` to the bottom reading stats pill in Reader.tsx.
**Why:** Screen readers currently cannot announce reading progress. The pill is visually prominent but invisible to assistive technology.
**Pros:** Zero visual change; meaningful accessibility improvement; ~2 lines of code.
**Cons:** None — pure additive.
**Context:** In Reader.tsx, the fixed bottom pill renders `{scrollPercent}%` and `{Math.ceil(timeRemaining)} min left`. Add `aria-label={\`Reading progress: ${scrollPercent}%, ${Math.ceil(timeRemaining)} minutes remaining\`}` to the outer div. Also consider `role="status"` so screen readers announce updates without being called explicitly.
**Depends on:** Substack reader overhaul (this PR — pill already exists)
**Effort:** XS (human: ~15min / CC: ~2min) | Priority: P3

## TODO-006: Incomplete-article priority in recommender
**What:** When returning the recommended article list, sort articles with existing reading history (incomplete) to the top.
**Why:** The chunk reading spec says incomplete articles appear first. Currently recommender doesn't query ReadingSession at all.
**Pros:** Makes the "resume where you left off" flow feel intentional; feeds the resumption cherry-pick naturally.
**Cons:** Adds a JOIN to the recommend query.
**Context:** In recommender.py, after fetching candidate segments, run a secondary query: `SELECT content_id FROM reading_sessions GROUP BY content_id` and use that set to partition candidates — incomplete first, then unread.
**Depends on:** chunk reading mode (this PR) for full effect
**Effort:** S (human: ~2h / CC: ~15min) | Priority: P2

## TODO-007: Archive page reading progress per article
**What:** Show "X% read" badge next to each article in the archive list.
**Why:** Users need to see which articles they've started and how far they got — especially once chunk mode surfaces incomplete articles prominently.
**Pros:** Natural companion to TODO-004 (thumbnail grid); feeds incomplete-first ordering; lets users manage their reading backlog.
**Cons:** Requires reading history aggregation per content_id.
**Context:** Archive endpoint (`GET /archive`) needs to JOIN reading_sessions and compute completion_percent per content. The ArchiveItem schema already has `completion_percent: float = 0` — it's just not populated. Wire it up in archive.py.
**Depends on:** TODO-006 (incomplete-first ordering) for full effect
**Effort:** S (human: ~3h / CC: ~20min) | Priority: P2

## TODO-008: "Tap to add" hint text in empty basket
**What:** When the selection pane opens with an empty basket, show a subtle one-line hint ("Tap an article to add it to your session") that disappears once the first item is selected.
**Why:** Without pre-selection, first-time users won't know the cards are tappable — the + icon is an affordance but the empty state gives no explicit instruction.
**Pros:** Zero layout change; dramatically reduces first-session confusion; ~10 lines in ReadingPack.tsx.
**Cons:** Tiny — might be seen as hand-holdy for a personal tool.
**Context:** In ReadingPack.tsx, add a conditional `{selectedIds.size === 0 && <p className="text-xs text-center text-muted">Tap an article to add it to your session</p>}` below the progress bar. Disappears the moment any item is added.
**Depends on:** Fix 4 (empty basket on open) in this PR
**Effort:** XS (human: ~15min / CC: ~3min) | Priority: P3

## TODO-009: Mark as finished from Archive page
**What:** Add a "Mark as finished" action to each archive item so users can dismiss articles without reading them. Show a visual indicator (greyed out + checkmark) for finished articles in the archive list.
**Why:** Currently the only way to mark an article finished is at the end of a reading session. Users should be able to prune their library from the archive.
**Pros:** Completes the "mark as finished" feature end-to-end; pairs naturally with TODO-007 (archive progress badge).
**Cons:** Requires archive list to include is_finished state from the Content model.
**Context:** Archive endpoint (GET /archive) needs to return is_finished from Content. ArchiveItem schema needs is_finished: bool = False field. Archive page renders a checkmark button per item that calls POST /content/{id}/finish. The is_finished column is added in the main "mark as finished" PR. This TODO is only the archive UI layer.
**Depends on:** Fix 2 (mark as finished backend + reader button) in this PR; TODO-007 for styling context
**Effort:** S (human: ~2h / CC: ~15min) | Priority: P2
