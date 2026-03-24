"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";
import { RecommendItem, getSegment, trackReading, SegmentResponse } from "@/lib/api";

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
}

export default function Reader({ items, onEndSession }: ReaderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [segment, setSegment] = useState<SegmentResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [heroFailed, setHeroFailed] = useState(false);
    const [startTime, setStartTime] = useState<number>(Date.now());
    const [wordsRead, setWordsRead] = useState(0);
    const [showEndCard, setShowEndCard] = useState(false);
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

    // For partial segments, word count covers only the visible slice of paragraphs.
    const allParagraphs = segment
        ? segment.text.split("\n\n").filter((p) => p.trim())
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
                    <span className="text-accent/20">·</span>
                    <span className="text-[10px] uppercase tracking-widest text-accent/40">
                        {currentIndex + 1} of {items.length}
                    </span>
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
                                    {segment.total_segments > 1 && (
                                        <span className="text-[10px] text-accent/30 ml-3">· Part {segment.segment_index + 1} of {segment.total_segments}</span>
                                    )}
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
                                {isPartialChunk ? (
                                    // Partial chunk CTA — "Want to finish this article?"
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
                                            Continue Reading →
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

                                        {/* Continue reading this piece (if multi-segment) */}
                                        {segment.total_segments > 1 && segment.segment_index < segment.total_segments - 1 && (
                                            <button
                                                onClick={handleNext}
                                                className="w-full max-w-sm bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90 flex justify-center items-center gap-2"
                                            >
                                                Continue Reading →
                                            </button>
                                        )}

                                        {/* Next piece in reading list */}
                                        {currentIndex < items.length - 1 ? (
                                            <div className="w-full max-w-sm space-y-3">
                                                <button
                                                    onClick={handleNext}
                                                    className="w-full bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl font-bold uppercase tracking-[0.12em] transition-all hover:bg-accent/20 flex justify-center items-center gap-2"
                                                >
                                                    Next: {items[currentIndex + 1].title.slice(0, 35)}{items[currentIndex + 1].title.length > 35 ? "…" : ""} →
                                                </button>
                                                <button
                                                    onClick={handleEndSession}
                                                    className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                                >
                                                    End Session
                                                </button>
                                            </div>
                                        ) : (
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

            {/* Bottom Reading Stats Pill */}
            {segment && !showEndCard && (
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
            )}
        </div>
    );
}
