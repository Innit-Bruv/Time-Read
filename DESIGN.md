# TimeRead Design System

## Philosophy

Dark Substack. Every reading experience should feel like opening something important — editorial, warm, intentional. No generic SaaS. No dashboard vibes.

## Colors

| Role | Value | Usage |
|------|-------|-------|
| Reader background | `#1c1c1c` | Reader.tsx full-screen container |
| Global background | `#0f0f0f` | App shell, home, archive |
| Reader text | `#f2f2f0` | Body copy in reader |
| Accent / brand amber | `#e8d5b0` | Buttons, links, drop cap, progress bars |
| Accent hover | `#b4a27d` | Hover states |
| Surface | `rgba(232, 213, 176, 0.05)` | Cards, inputs |
| Border | `rgba(232, 213, 176, 0.10)` | Dividers, card borders |

## Typography

| Role | Font | Size | Notes |
|------|------|------|-------|
| Reader body | Newsreader (serif) | 21px desktop / 19px mobile | `var(--font-reader)` |
| Article title | Newsreader (serif) | 4xl–5xl, weight 700 | In reader header |
| UI / navigation | Inter (sans) | 10–14px | Labels, buttons, nav |
| Drop cap | Newsreader | 4.5rem desktop / 3.5rem mobile | First letter of first `<p>` in reader |

## Reader Layout (Substack dark)

```
┌─────────────────────────────────────┐
│  Progress bar (2px, accent, top)    │
│  Floating nav: TimeRead · 1 of N   [Exit] │
│                                     │
│  [Hero image 16:9 — segment 0 only] │
│                                     │
│  source.com · Part 1 of 2           │
│  Article Title                      │
│  ─────────────────────────────────  │
│  [favicon] Author · Mar 24, 2026 · 8 min read │
│  ─────────────────────────────────  │
│                                     │
│  Ṫhe first paragraph with drop cap… │
│                                     │
│  Subsequent paragraphs at 21px…     │
│                                     │
│  [Inline images, full-width]        │
│                                     │
│  ─────────── footer CTA ──────────  │
│                                     │
│  [Bottom pill: 42% ── 5 min left]  │
└─────────────────────────────────────┘
```

## Components

### Hero Image
- Full-bleed, `aspect-video` (16:9), `object-cover`
- Appears on `segment_index === 0` only
- Removed entirely on load failure (`heroFailed` state) — no empty box
- Source: `content.cover_image` (og:image extracted at ingest)

### Favicon / Initials Avatar
- 32×32px circle, `rounded-full`
- Source: `https://www.google.com/s2/favicons?domain={domain}&sz=64`
- Fallback: colored initials circle (color stable-hashed from author name)
- Hidden entirely when `author` is null

### Byline separator
- Middle dot `·` (U+00B7), conditionally rendered — never orphaned

### Drop Cap
- CSS only: `.reader-text > p:first-of-type::first-letter`
- `>` combinator — skips headers and blockquotes
- Color: `#e8d5b0` (brand amber)

### Source Badge
- Plain text, `text-[10px] uppercase tracking-[0.25em]`
- No pill border — understated, Substack-faithful

### Progress Pill (bottom)
- `bg-[#0f0e0c]/95 backdrop-blur-sm`, `rounded-full`
- Shows scroll % + session minutes remaining
- Hidden when end card is visible

## Spacing Scale

- Max article width: `680px`
- Side padding: `px-6` (24px)
- Article top padding: `pt-24` (below floating nav)
- Bottom padding: `pb-40` (above pill)

## Inline Image Handling

- `SafeImage` component resolves relative URLs: `new URL(src, baseUrl).href`
- Load failure shows styled placeholder: dashed border + "Image unavailable"
- Never `display:none` on failure — maintains layout reflow

## Interaction States

| State | What the user sees |
|-------|--------------------|
| Loading | "Loading…" text (TODO-003: replace with skeleton) |
| Hero load failure | Hero section removed entirely |
| Favicon load failure | Initials circle |
| Inline image failure | "Image unavailable" dashed placeholder |
| Partial chunk | "partial" badge in byline + chunked CTA |
| Session end | "You've completed your reading session!" |
