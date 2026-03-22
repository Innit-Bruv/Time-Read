"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";
import { RecommendItem, getSegment, trackReading, SegmentResponse } from "@/lib/api";

function SafeImage(props: ComponentPropsWithoutRef<"img">) {
    return (
        <img
            {...props}
            alt={props.alt || ""}
            loading="lazy"
            style={{ maxWidth: "100%", borderRadius: "8px" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1f1b13] text-[#f1f5f9]/90 transition-colors duration-300" ref={scrollRef}>
            {/* Top Session Progress Bar */}
            <div className="fixed top-0 left-0 w-full z-50">
                <div className="h-1 w-full bg-accent/10">
                    <div
                        className="h-full bg-accent shadow-[0_0_8px_rgba(232,213,176,0.6)] transition-all ease-out duration-500"
                        style={{ width: `${sessionProgress * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Floating Nav */}
            <nav className="fixed top-0 left-0 w-full px-6 py-6 flex justify-between items-center z-40 bg-gradient-to-b from-[#1f1b13] via-[#1f1b13]/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <span className="text-xs uppercase tracking-[0.2em] font-medium text-accent/60">TimeRead</span>
                    <span className="text-accent/20">|</span>
                    <span className="text-[10px] uppercase tracking-widest text-accent/40">
                        {currentIndex + 1} of {items.length}
                    </span>
                </div>
                <div className="flex items-center gap-6 pointer-events-auto">
                    <button onClick={handleEndSession} className="text-accent/40 hover:text-accent transition-colors text-xs uppercase tracking-widest px-4 py-2 border border-accent/10 hover:border-accent/40 rounded-full">
                        Exit Session
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative flex flex-col items-center px-6 pt-28 pb-48">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-accent/50 uppercase tracking-widest text-sm">Loading segment...</div>
                    </div>
                ) : segment ? (
                    <article className="w-full max-w-[680px] mx-auto">
                        <header className="mb-16">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent py-1 px-2 border border-accent/20 rounded">
                                    {segment.source || "Web"}
                                </span>
                                <span className="text-xs text-accent/40">{Math.round(currentItem.estimated_time)} min read</span>
                                {isPartialChunk && (
                                    <span className="text-[10px] uppercase tracking-[0.2em] text-accent/40 py-1 px-2 border border-accent/10 rounded">
                                        partial
                                    </span>
                                )}
                                {segment.total_segments > 1 && (
                                    <span className="text-xs text-accent/40">· Part {segment.segment_index + 1} of {segment.total_segments}</span>
                                )}
                            </div>
                            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-slate-100 leading-tight mb-8" style={{ fontFamily: "var(--font-lora)" }}>
                                {segment.title}
                            </h1>
                            {segment.author && (
                                <div className="flex items-center gap-4 py-6 border-y border-accent/10">
                                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-accent/50">person</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-100">{segment.author}</p>
                                        <p className="text-xs text-accent/40">Author</p>
                                    </div>
                                </div>
                            )}
                        </header>

                        <section className="reader-text">
                            <div className="prose prose-invert max-w-none text-xl md:text-2xl leading-relaxed">
                                <ReactMarkdown components={{ img: SafeImage }}>
                                    {visibleParagraphs.join("\n\n")}
                                </ReactMarkdown>
                            </div>
                        </section>

                        {/* Footer CTA */}
                        <footer className="mt-20 pt-12 border-t border-accent/10">
                            <div className="flex flex-col items-center gap-6">
                                {isPartialChunk ? (
                                    // Partial chunk CTA — "Want to finish this article?"
                                    <>
                                        <div className="text-center mb-4">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-2">
                                                You&apos;ve finished your {Math.round(currentItem.estimated_time)} min chunk
                                            </p>
                                            <p className="text-accent font-serif italic text-2xl">
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
                                        <div className="text-center mb-4">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-2">
                                                Finished reading
                                            </p>
                                            <p className="text-accent font-serif italic text-2xl">{segment.title}</p>
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
                                                    Next: {items[currentIndex + 1].title.slice(0, 35)}{items[currentIndex + 1].title.length > 35 ? "..." : ""} →
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
                                                    <p className="text-accent/60 text-sm mb-1">🎉 You&apos;ve completed your reading session!</p>
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

            {/* Bottom Kindle-style Stats Pill */}
            {segment && !showEndCard && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-[#0f0f0f]/90 backdrop-blur-md border border-accent/10 rounded-full flex items-center gap-6 shadow-2xl transition-all duration-500">
                    <div className="flex items-center gap-3">
                        <div className="w-20 h-1 bg-accent/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-accent rounded-full transition-all duration-300"
                                style={{ width: `${scrollPercent}%` }}
                            ></div>
                        </div>
                        <span className="text-[11px] text-accent font-bold tabular-nums">
                            {scrollPercent}%
                        </span>
                    </div>
                    <div className="h-4 w-px bg-accent/20"></div>
                    <span className="text-[10px] text-accent/60 uppercase tracking-widest">
                        {Math.ceil(timeRemaining)} min left in session
                    </span>
                </div>
            )}
        </div>
    );
}
