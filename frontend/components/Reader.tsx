"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";
import { RecommendItem, getSegment, trackReading, markFinished, SegmentResponse } from "@/lib/api";
import { useChunkMode } from "@/hooks/useChunkMode";

interface SafeImageProps extends ComponentPropsWithoutRef<"img"> {
    baseUrl?: string;
}

function SafeImage({ src, baseUrl, alt, ...props }: SafeImageProps) {
    const [failed, setFailed] = useState(false);

    // Resolve relative URLs against the article's base URL
    let resolvedSrc = src;
    if (typeof src === "string" && baseUrl && !src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("//")) {
        try {
            resolvedSrc = new URL(src, baseUrl).href;
        } catch {
            resolvedSrc = src;
        }
    }

    if (failed) {
        return (
            <span className="flex items-center justify-center w-full my-8 py-6 border border-dashed border-accent/20 rounded text-accent/30 text-xs uppercase tracking-widest">
                Image unavailable
            </span>
        );
    }

    return (
        <img
            {...props}
            src={resolvedSrc}
            alt={alt || ""}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}

function getInitials(name: string): string {
    return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// Stable color from author name for initials circle
function authorColor(name: string): string {
    const colors = ["#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

interface FaviconAvatarProps {
    author: string;
    source: string | null;
}

function FaviconAvatar({ author, source }: FaviconAvatarProps) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    const initials = getInitials(author);
    const bgColor = authorColor(author);

    if (!source) {
        // No domain, always show initials
        return (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ backgroundColor: bgColor }}>
                {initials}
            </div>
        );
    }

    const domain = source.replace(/^https?:\/\//, "").split("/")[0];
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    if (faviconFailed) {
        return (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ backgroundColor: bgColor }}>
                {initials}
            </div>
        );
    }

    return (
        <img
            src={faviconUrl}
            alt={author}
            className="w-8 h-8 rounded-full object-cover shrink-0 bg-white/5"
            onError={() => setFaviconFailed(true)}
        />
    );
}

interface ReaderProps {
    items: RecommendItem[];
    onEndSession: () => void;
    chunkMode?: boolean;
    timeBudget?: number;
    onRequestRound2?: () => Promise<void>;
}

export default function Reader({ items, onEndSession, chunkMode = false, timeBudget = 0, onRequestRound2 }: ReaderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [segment, setSegment] = useState<SegmentResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [heroFailed, setHeroFailed] = useState(false);
    const [startTime, setStartTime] = useState<number>(Date.now());
    const [wordsRead, setWordsRead] = useState(0);
    const [showEndCard, setShowEndCard] = useState(false);
    const [round2Loading, setRound2Loading] = useState(false);
    const [finishLoading, setFinishLoading] = useState(false);
    const chunk = useChunkMode(items, timeBudget);
    const scrollRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    // Effective paragraph bounds — initialized from item, but overrideable for
    // "Continue Reading →" within the same segment after a partial chunk.
    const [effectiveStart, setEffectiveStart] = useState<number>(
        items[0]?.paragraph_start ?? 0
    );
    const [effectiveEnd, setEffectiveEnd] = useState<number | null | undefined>(
        items[0]?.paragraph_end
    );

    const currentItem = items[currentIndex];
    const totalTime = items.reduce((sum, i) => sum + i.estimated_time, 0);
    const completedTime = items.slice(0, currentIndex).reduce((sum, i) => sum + i.estimated_time, 0);
    const sessionProgress = totalTime > 0 ? completedTime / totalTime : 0;
    const timeRemaining = totalTime - completedTime;

    // Whether the current chunk is a partial slice (not the full segment).
    const isPartialChunk = effectiveEnd != null;

    // Smart paragraph split: try \n\n first, fall back to \n for text stored
    // with single-newline separators. Mirrors backend split_paragraphs().
    const allParagraphs = segment
        ? (() => {
            const byDouble = segment.text.split("\n\n").filter((p: string) => p.trim());
            if (byDouble.length > 1) return byDouble;
            const bySingle = segment.text.split("\n").filter((p: string) => p.trim());
            if (bySingle.length > 1) return bySingle;
            const stripped = segment.text.trim();
            return stripped ? [stripped] : [];
          })()
        : [];
    const visibleParagraphs = allParagraphs.slice(
        effectiveStart,
        effectiveEnd ?? undefined
    );
    const visibleWordCount = visibleParagraphs.join(" ").split(/\s+/).filter(Boolean).length;

    // Remaining time after this chunk (used in partial CTA)
    const remainingSegmentMinutes = (() => {
        if (!isPartialChunk || !segment) return 0;
        const remainingParas = allParagraphs.slice(effectiveEnd ?? 0);
        const words = remainingParas.join(" ").split(/\s+/).filter(Boolean).length;
        return Math.ceil(words / 200); // default 200 WPM
    })();

    // Scroll-based reading progress (Kindle-style)
    const scrollPercent = segment
        ? Math.min(Math.floor((wordsRead / Math.max(visibleWordCount, 1)) * 100), 100)
        : 0;

    // Reset effective paragraph bounds whenever we navigate to a new item.
    useEffect(() => {
        setEffectiveStart(currentItem?.paragraph_start ?? 0);
        setEffectiveEnd(currentItem?.paragraph_end ?? null);
    }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load segment text
    const loadSegment = useCallback(async () => {
        if (!currentItem) return;
        setLoading(true);
        setShowEndCard(false);
        try {
            const data = await getSegment(currentItem.content_id, currentItem.segment_id);
            setSegment(data);
            setHeroFailed(false);
            setStartTime(Date.now());
            setWordsRead(0);
            scrollRef.current?.scrollTo(0, 0);
        } catch (err) {
            console.error("Failed to load segment:", err);
        } finally {
            setLoading(false);
        }
    }, [currentItem]);

    useEffect(() => {
        loadSegment();
    }, [loadSegment]);

    // Track reading on scroll — throttled via requestAnimationFrame to avoid
    // 30-60 state updates per second on mobile Safari.
    useEffect(() => {
        const handleScroll = () => {
            if (!scrollRef.current || !segment) return;
            if (rafRef.current) return; // already scheduled, skip

            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                if (!scrollRef.current) return;
                const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
                const pct = scrollTop / (scrollHeight - clientHeight);
                const newWordsRead = Math.floor(pct * visibleWordCount);
                setWordsRead(newWordsRead);

                if (pct > 0.88 && !showEndCard) {
                    setShowEndCard(true);
                }
            });
        };

        const el = scrollRef.current;
        el?.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            el?.removeEventListener("scroll", handleScroll);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [segment, showEndCard, visibleWordCount]);

    const handleTrack = async (completed: boolean) => {
        if (!currentItem) return;
        const timeSpent = (Date.now() - startTime) / 1000;
        // Partial chunks never mark the segment as completed — record where we stopped.
        try {
            await trackReading({
                segment_id: currentItem.segment_id,
                time_spent: timeSpent,
                words_read: wordsRead,
                completed: completed && !isPartialChunk,
                paragraph_end: isPartialChunk ? (effectiveEnd ?? null) : undefined,
            });
        } catch (err) {
            console.error("Failed to track reading:", err);
        }
    };

    const handleNext = async () => {
        await handleTrack(true);
        if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onEndSession();
        }
    };

    const handleEndSession = async () => {
        await handleTrack(false);
        onEndSession();
    };

    // "Continue Reading →" from the partial CTA — show the rest of this segment.
    const handleContinuePartial = async () => {
        await handleTrack(false); // chunk done, not full segment
        const nextStart = effectiveEnd ?? 0;
        setEffectiveStart(nextStart);
        setEffectiveEnd(null);  // now reading to end of segment
        setStartTime(Date.now());
        setWordsRead(0);
        setShowEndCard(false);
        scrollRef.current?.scrollTo(0, 0);
    };

    // "Save my place & exit" from the partial CTA.
    const handleSaveAndExit = async () => {
        await handleTrack(false); // paragraph_end recorded for resume
        onEndSession();
    };

    // Chunk mode: "Next chunk" — save position and move to next article.
    const handleChunkNext = async () => {
        await handleTrack(false); // save paragraph_end, not completed
        if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
        // If on last chunk, the end card handles Round 2 / End Session
    };

    // Mark article as finished — excluded from future recommendations
    const handleMarkFinished = async () => {
        if (!currentItem) return;
        setFinishLoading(true);
        try {
            await markFinished(currentItem.content_id);
        } catch (err) {
            console.error("Failed to mark as finished:", err);
        } finally {
            setFinishLoading(false);
            onEndSession();
        }
    };

    // Chunk mode: "Go Deeper — Round 2"
    const handleRound2 = async () => {
        await handleTrack(false);
        if (!onRequestRound2) return;
        setRound2Loading(true);
        try {
            await onRequestRound2();
            // Reader re-mounts via key={session_id} in page.tsx
        } finally {
            setRound2Loading(false);
        }
    };

    const isLastChunk = chunkMode && currentIndex === items.length - 1;

    // Archive mode: all items belong to the same article (segments passed directly from archive)
    const isArchiveMode = items.length > 1 && items.every(i => i.content_id === items[0]?.content_id);

    if (!currentItem) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1c1c1c] text-[#f2f2f0]" ref={scrollRef}>
            {/* Top Session Progress Bar */}
            <div className="fixed top-0 left-0 w-full z-50">
                <div className="h-[2px] w-full bg-accent/10">
                    <div
                        className="h-full bg-accent transition-all ease-out duration-500"
                        style={{ width: `${sessionProgress * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Floating Nav */}
            <nav className="fixed top-0 left-0 w-full px-6 py-5 flex justify-between items-center z-40 bg-gradient-to-b from-[#1c1c1c] via-[#1c1c1c]/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <span className="text-xs uppercase tracking-[0.2em] font-medium text-accent/50">TimeRead</span>
                    {!isArchiveMode && (
                        <>
                            <span className="text-accent/20">·</span>
                            <span className="text-[10px] uppercase tracking-widest text-accent/40">
                                {currentIndex + 1} of {items.length}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-6 pointer-events-auto">
                    <button onClick={handleEndSession} className="text-accent/40 hover:text-accent/80 transition-colors text-xs uppercase tracking-widest">
                        Exit
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative flex flex-col items-center px-6 pt-24 pb-40">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-accent/40 uppercase tracking-widest text-xs">Loading…</div>
                    </div>
                ) : segment ? (
                    <article className="w-full max-w-[680px] mx-auto">
                        {/* Hero image — first segment only, hidden if null or load fails */}
                        {segment.cover_image && !heroFailed && segment.segment_index === 0 && (
                            <div className="w-full aspect-video -mx-6 mb-10 overflow-hidden" style={{ width: "calc(100% + 3rem)" }}>
                                <img
                                    src={segment.cover_image}
                                    alt={segment.title}
                                    className="w-full h-full object-cover"
                                    loading="eager"
                                    onError={() => setHeroFailed(true)}
                                />
                            </div>
                        )}

                        {/* Article Header */}
                        <header className="mb-10">
                            {/* Source badge */}
                            {segment.source && (
                                <div className="mb-4">
                                    <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-accent/60">
                                        {segment.source}
                                    </span>
                                </div>
                            )}

                            {/* Title */}
                            <h1 className="text-4xl md:text-5xl font-bold text-[#f2f2f0] leading-[1.15] mb-6 tracking-tight" style={{ fontFamily: "var(--font-reader)" }}>
                                {segment.title}
                            </h1>

                            {/* Byline */}
                            {segment.author && (
                                <div className="flex items-center gap-3 py-4 border-y border-white/10">
                                    <FaviconAvatar author={segment.author} source={segment.source} />
                                    <div className="flex items-center gap-1.5 text-sm text-[#f2f2f0]/60 flex-wrap">
                                        <span className="font-medium text-[#f2f2f0]/80">{segment.author}</span>
                                        {segment.publish_date && (
                                            <>
                                                <span className="text-[#f2f2f0]/30">·</span>
                                                <span>{new Date(segment.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                            </>
                                        )}
                                        <span className="text-[#f2f2f0]/30">·</span>
                                        <span>{Math.round(currentItem.estimated_time)} min read</span>
                                        {isPartialChunk && (
                                            <>
                                                <span className="text-[#f2f2f0]/30">·</span>
                                                <span className="text-[10px] uppercase tracking-[0.2em] text-accent/40">partial</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Byline without author (still show date + read time) */}
                            {!segment.author && (
                                <div className="flex items-center gap-2 text-sm text-[#f2f2f0]/50">
                                    {segment.publish_date && (
                                        <>
                                            <span>{new Date(segment.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                            <span className="text-[#f2f2f0]/20">·</span>
                                        </>
                                    )}
                                    <span>{Math.round(currentItem.estimated_time)} min read</span>
                                </div>
                            )}
                        </header>

                        {/* Article Body */}
                        <section className="reader-text">
                            <ReactMarkdown components={{
                                img: (props) => <SafeImage {...props} baseUrl={segment.url} />
                            }}>
                                {visibleParagraphs.join("\n\n")}
                            </ReactMarkdown>
                        </section>

                        {/* Footer CTA */}
                        <footer className="mt-16 pt-10 border-t border-accent/10">
                            <div className="flex flex-col items-center gap-5">
                                {isPartialChunk && chunkMode ? (
                                    // Chunk mode end card
                                    <>
                                        <div className="text-center mb-2">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-2">
                                                Article {currentIndex + 1} of {items.length}
                                            </p>
                                            <p className="text-accent font-bold text-2xl leading-snug" style={{ fontFamily: "var(--font-reader)" }}>
                                                {isLastChunk ? "You've sampled all articles!" : "Chunk complete"}
                                            </p>
                                            {remainingSegmentMinutes > 0 && !isLastChunk && (
                                                <p className="text-xs text-accent/40 mt-2">
                                                    ~{remainingSegmentMinutes} min left in this article
                                                </p>
                                            )}
                                        </div>

                                        {/* Read Full Article — always available */}
                                        <button
                                            onClick={handleContinuePartial}
                                            className="w-full max-w-sm bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90"
                                        >
                                            Read Full Article{remainingSegmentMinutes > 0 ? ` · ~${remainingSegmentMinutes} min left` : ""}
                                        </button>

                                        {isLastChunk ? (
                                            // Last chunk → Round 2 or End
                                            <div className="w-full max-w-sm space-y-3">
                                                <button
                                                    onClick={handleRound2}
                                                    disabled={round2Loading}
                                                    className="w-full bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl font-bold uppercase tracking-[0.12em] transition-all hover:bg-accent/20 disabled:opacity-40"
                                                >
                                                    {round2Loading ? "Loading…" : "Go Deeper — Round 2"}
                                                </button>
                                                <button
                                                    onClick={handleEndSession}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                                >
                                                    End Session
                                                </button>
                                            </div>
                                        ) : (
                                            // Next chunk
                                            <div className="w-full max-w-sm space-y-3">
                                                <button
                                                    onClick={handleChunkNext}
                                                    className="w-full bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl font-bold uppercase tracking-[0.12em] transition-all hover:bg-accent/20 flex justify-center items-center gap-2"
                                                >
                                                    Next: {items[currentIndex + 1]?.title.slice(0, 30)}{(items[currentIndex + 1]?.title.length ?? 0) > 30 ? "…" : ""} →
                                                </button>
                                                <button
                                                    onClick={handleEndSession}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                                >
                                                    End Session
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : isPartialChunk ? (
                                    // Single-article partial chunk CTA — "Want to finish this article?"
                                    <>
                                        <div className="text-center mb-2">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-3">
                                                You&apos;ve finished your {Math.round(currentItem.estimated_time)} min chunk
                                            </p>
                                            <p className="text-accent font-bold text-2xl leading-snug" style={{ fontFamily: "var(--font-reader)" }}>
                                                Want to finish this article?
                                            </p>
                                            {remainingSegmentMinutes > 0 && (
                                                <p className="text-xs text-accent/40 mt-2">
                                                    ~{remainingSegmentMinutes} min remaining
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleContinuePartial}
                                            className="w-full max-w-sm bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90 flex justify-center items-center gap-2"
                                        >
                                            Continue reading this article{remainingSegmentMinutes > 0 ? ` · ~${remainingSegmentMinutes} min left` : ""} →
                                        </button>
                                        <button
                                            onClick={handleSaveAndExit}
                                            className="w-full max-w-sm py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                        >
                                            Save my place &amp; exit
                                        </button>
                                    </>
                                ) : (
                                    // Normal end-of-segment CTA
                                    <>
                                        <div className="text-center mb-2">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-3">
                                                Finished reading
                                            </p>
                                            <p className="font-bold text-xl text-slate-100 leading-snug" style={{ fontFamily: "var(--font-reader)" }}>
                                                {segment.title}
                                            </p>
                                        </div>

                                        {/* Archive mode: next segment of the same article */}
                                        {isArchiveMode && currentIndex < items.length - 1 ? (
                                            <div className="w-full max-w-sm space-y-3">
                                                <button
                                                    onClick={handleNext}
                                                    className="w-full max-w-sm bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90 flex justify-center items-center gap-2"
                                                >
                                                    Continue reading this article →
                                                </button>
                                                <button
                                                    onClick={handleEndSession}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                                >
                                                    Exit
                                                </button>
                                            </div>
                                        ) : isArchiveMode ? (
                                            // Archive mode: finished the whole article
                                            <div className="w-full max-w-sm space-y-3">
                                                <div className="text-center py-4">
                                                    <p className="text-accent/60 text-sm mb-1">Article complete!</p>
                                                </div>
                                                <button
                                                    onClick={onEndSession}
                                                    className="w-full bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90"
                                                >
                                                    Back to Library
                                                </button>
                                                <button
                                                    onClick={handleMarkFinished}
                                                    disabled={finishLoading}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/30 hover:text-accent/60 transition-colors disabled:opacity-40"
                                                >
                                                    {finishLoading ? "Saving…" : "Done with this article — don't show again"}
                                                </button>
                                            </div>
                                        ) : currentIndex < items.length - 1 ? (
                                            // Normal session: next article
                                            <div className="w-full max-w-sm space-y-3">
                                                <button
                                                    onClick={handleNext}
                                                    className="w-full bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl font-bold uppercase tracking-[0.12em] transition-all hover:bg-accent/20 flex justify-center items-center gap-2"
                                                >
                                                    Next: {items[currentIndex + 1].title.slice(0, 35)}{items[currentIndex + 1].title.length > 35 ? "…" : ""} →
                                                </button>
                                                <button
                                                    onClick={handleMarkFinished}
                                                    disabled={finishLoading}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/30 hover:text-accent/60 transition-colors disabled:opacity-40"
                                                >
                                                    {finishLoading ? "Saving…" : "Done with this article — don't show again"}
                                                </button>
                                            </div>
                                        ) : (
                                            // Normal session: last article done
                                            <div className="w-full max-w-sm space-y-3">
                                                <div className="text-center py-4">
                                                    <p className="text-accent/60 text-sm mb-1">You&apos;ve completed your reading session!</p>
                                                    <p className="text-accent/30 text-xs">{Math.round(totalTime)} minutes well spent</p>
                                                </div>
                                                <button
                                                    onClick={onEndSession}
                                                    className="w-full bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90"
                                                >
                                                    Back to Home
                                                </button>
                                                <button
                                                    onClick={handleMarkFinished}
                                                    disabled={finishLoading}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/30 hover:text-accent/60 transition-colors disabled:opacity-40"
                                                >
                                                    {finishLoading ? "Saving…" : "Done with this article — don't show again"}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </footer>
                    </article>
                ) : (
                    <div className="text-center text-accent/50 pt-20">Failed to load content.</div>
                )}
            </main>

            {/* Bottom stats — chunk mode shows article pills, normal mode shows progress pill */}
            {segment && !showEndCard && (
                chunk.isChunkMode ? (
                    // Chunk mode: N article progress pills
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 bg-[#0f0e0c]/95 backdrop-blur-sm border border-accent/10 rounded-full shadow-xl">
                        {items.map((_, i) => (
                            <div key={i} className="relative h-1 w-8 bg-accent/15 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-300"
                                    style={{
                                        width: i < currentIndex ? "100%" : i === currentIndex ? `${scrollPercent}%` : "0%",
                                    }}
                                />
                            </div>
                        ))}
                        <div className="h-3 w-px bg-accent/20 mx-1" />
                        <span className="text-[10px] text-accent/50 uppercase tracking-widest">
                            {currentIndex + 1}/{items.length}
                        </span>
                    </div>
                ) : (
                    // Normal mode: single progress pill
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#0f0e0c]/95 backdrop-blur-sm border border-accent/10 rounded-full flex items-center gap-5 shadow-xl">
                        <div className="flex items-center gap-2.5">
                            <div className="w-16 h-0.5 bg-accent/15 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-accent rounded-full transition-all duration-300"
                                    style={{ width: `${scrollPercent}%` }}
                                ></div>
                            </div>
                            <span className="text-[11px] text-accent font-semibold tabular-nums">
                                {scrollPercent}%
                            </span>
                        </div>
                        <div className="h-3 w-px bg-accent/20"></div>
                        <span className="text-[10px] text-accent/50 uppercase tracking-widest">
                            {Math.ceil(timeRemaining)} min left
                        </span>
                    </div>
                )
            )}
        </div>
    );
}
