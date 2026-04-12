"use client";

import { useState } from "react";
import TimeSelector from "@/components/TimeSelector";
import PackTimeline from "@/components/PackTimeline";
import Reader from "@/components/Reader";
import { RecommendItem, SegmentResponse } from "@/lib/api";

// ─── Fixture data ────────────────────────────────────────────────────────────
// Real content, statically embedded. No backend calls needed.

const ARTICLE_1_TEXT = `Your reading list is a graveyard.

You know this. You've saved the same Substack post three times because you forgot you'd already saved it. You have browser tabs that are six months old. Your Pocket queue has 847 articles. Your Twitter bookmarks are a disaster.

This isn't a time management problem. You have time to scroll Twitter for forty-five minutes at 11pm. You have time to watch two episodes of something. You have time.

The problem is that your reading list has been designed like a to-do list — and it shouldn't be.

A to-do list works by accumulation. Items pile up. You work through them. Each item is roughly equivalent: an email to reply to, a form to fill in. The currency is completion.

Reading doesn't work that way. Reading is contextual. A piece about AI safety is fascinating when you're curious and pointless when you're mentally drained. A long Paul Graham essay rewards a quiet Sunday morning and fights you on a commute. A quick Twitter thread is perfect for three minutes at the coffee shop and wasteful when you have an hour free.

The mismatch between how we save content and how we actually read it is the root cause of the unread pile.

**The economics of saving**

Saving an article takes one second. A tap, a click, a keyboard shortcut. The friction is nearly zero. And so we save everything.

Reading that article takes five to twenty minutes. The friction is real — you need the right headspace, the right amount of time, the right device. And so we read almost nothing.

This creates an imbalance that only grows over time. The queue grows faster than it shrinks, and eventually you stop believing it represents anything actionable. It becomes a wishlist, not a plan.

The wishlist framing isn't wrong exactly — but it makes the problem worse. A wishlist doesn't demand action. It sits there, aspirational, fading into background noise. You stop seeing the articles. You lose the intent you had when you saved them.

**What actually happens when you have time**

Here's the moment: you have fifteen free minutes. Maybe it's a commute, a lunch break, a quiet evening. You want to read something.

You open your reading app. You're confronted with 200+ items. Some are months old. Some you vaguely remember saving. Some you have no memory of saving at all. You scroll. Nothing quite fits the mood, the time available, the mental energy you have. You spend six of your fifteen minutes deciding. You give up, or you open Twitter instead.

This is the real cost of the unread pile. It's not just that you're not reading — it's that the pile itself destroys the reading moments. The decision cost eats the available time.

**The fix isn't more organization**

The instinct is to organize. Create folders. Add tags. Build a Notion database with ratings and categories. This is almost always wrong.

Organization adds work at save-time (you have to categorize before you store) or at read-time (you have to navigate the taxonomy to find something). Either way, you're adding friction to the wrong side of the equation.

The thing that needs to happen isn't better filing. It's elimination of the selection step at read-time. When the reading window appears, you shouldn't be deciding what to read. You should already be reading.

The right model isn't a library. It's a queue with intelligence. Something that knows what you have, knows how long you have, and makes the call for you.

You open the app. You say: I have fifteen minutes. It says: here's what you're reading. You read.

That's the whole product.`;

const ARTICLE_2_TEXT = `Why your Pocket queue has 400 articles and you've read 12 of them this year.

A thread on the asymmetry of saving vs. reading.

---

Saving an article takes 1 second. Reading it takes 5–20 minutes.

This gap — the effort asymmetry — is why every reading list eventually becomes a graveyard. The queue grows faster than it can be consumed. Eventually it stops feeling like a plan and starts feeling like debt.

---

You save with intention: "I'll read this when I have time."

The problem isn't that you never have time. You're on your phone for 3+ hours a day. You have time.

The problem is that "having time" and "being in reading mode" rarely coincide. Time appears in five-minute cracks. Reading mode requires twenty minutes of focus. The windows don't match.

---

When you do have a proper free window — commute, lunch break, Sunday morning — you open the app and face 400 items.

You scroll. Nothing lands right. You're in a fifteen-minute mood but everything is thirty minutes. Or you're in a light mood but the queue is full of dense long-reads you saved on an ambitious Tuesday.

You spend the window deciding. Then the window closes.

---

This is the core failure: the selection step happens at the worst possible moment.

You have limited mental energy. You're in a time crunch. That's exactly when we expect you to sort through hundreds of items and pick the right one.

It's like asking someone to plan their meal from scratch right when they're hungriest. The cognitive load is highest exactly when capacity is lowest.

---

The fix isn't better organization.

Tags, folders, priority flags — these just push the work to save-time or add navigation overhead at read-time. You're still deciding. The anxiety is still there. The pile is still growing.

---

The fix is removing the decision entirely.

Tell the system how much time you have. Let it pick. Start reading.

Your job is to show up. The app's job is to have something ready.

---

That's the only design that actually solves the problem. Not a better inbox. Not smarter tags. Just: you have ten minutes, here's what you're reading, go.`;

interface DemoArticle {
    item: RecommendItem;
    segment: SegmentResponse;
}

const DEMO_ARTICLES: DemoArticle[] = [
    {
        item: {
            content_id: "demo-content-001",
            segment_id: "demo-segment-001",
            title: "Your Reading List Is Not a To-Do List",
            source: "every.to",
            author: "Dan Shipper",
            content_type: "substack",
            estimated_time: 5,
            article_total_time: 5,
            segment_index: 0,
            total_segments: 1,
            is_continuation: false,
            paragraph_start: 0,
            paragraph_end: null,
        },
        segment: {
            segment_id: "demo-segment-001",
            content_id: "demo-content-001",
            title: "Your Reading List Is Not a To-Do List",
            author: "Dan Shipper",
            source: "every.to",
            url: "https://every.to",
            content_type: "substack",
            segment_index: 0,
            total_segments: 1,
            estimated_time: 5,
            text: ARTICLE_1_TEXT,
            word_count: 1000,
            cover_image: null,
            publish_date: null,
        },
    },
    {
        item: {
            content_id: "demo-content-002",
            segment_id: "demo-segment-002",
            title: "Thread: Why your reading list never shrinks",
            source: "twitter.com",
            author: "Shreyas Doshi",
            content_type: "twitter_thread",
            estimated_time: 3,
            article_total_time: 3,
            segment_index: 0,
            total_segments: 1,
            is_continuation: false,
            paragraph_start: 0,
            paragraph_end: null,
        },
        segment: {
            segment_id: "demo-segment-002",
            content_id: "demo-content-002",
            title: "Thread: Why your reading list never shrinks",
            author: "Shreyas Doshi",
            source: "twitter.com",
            url: "https://twitter.com",
            content_type: "twitter_thread",
            segment_index: 0,
            total_segments: 1,
            estimated_time: 3,
            text: ARTICLE_2_TEXT,
            word_count: 600,
            cover_image: null,
            publish_date: null,
        },
    },
];

const SEGMENT_OVERRIDE: Record<string, SegmentResponse> = Object.fromEntries(
    DEMO_ARTICLES.map(({ segment }) => [segment.segment_id, segment])
);

type View = "home" | "pack" | "reading";

function getDemoPackForBudget(budget: number): RecommendItem[] {
    // Greedy fill from fixture articles
    const selected: RecommendItem[] = [];
    let remaining = budget;
    for (const { item } of DEMO_ARTICLES) {
        if (remaining <= 0) break;
        if (item.estimated_time <= remaining) {
            selected.push(item);
            remaining -= item.estimated_time;
        } else if (remaining >= 1) {
            selected.push({ ...item, estimated_time: Math.round(remaining) });
            break;
        }
    }
    return selected.length > 0 ? selected : DEMO_ARTICLES.map(d => d.item);
}

export default function DemoPage() {
    const [view, setView] = useState<View>("home");
    const [timeBudget, setTimeBudget] = useState<number | null>(null);
    const [packItems, setPackItems] = useState<RecommendItem[]>([]);

    const totalTime = packItems.reduce((s, i) => s + i.estimated_time, 0);

    if (view === "reading") {
        return (
            <Reader
                key="demo-session"
                items={packItems}
                timeBudget={timeBudget ?? 0}
                segmentOverride={SEGMENT_OVERRIDE}
                onEndSession={() => { setView("home"); setTimeBudget(null); }}
            />
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-4 relative">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px]" />
            </div>

            <div className="w-full max-w-[700px] space-y-4 md:space-y-6 relative z-10 pt-14">
                {/* Header */}
                <header className="absolute top-0 w-full flex items-center justify-between px-6 lg:px-16 py-4 border-b border-accent/10 left-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-accent font-serif italic text-xl tracking-tight">TimeRead</h2>
                        <span className="text-[9px] uppercase tracking-[0.2em] font-medium px-2 py-0.5 rounded-full border border-accent/30 text-accent/60">
                            Demo
                        </span>
                    </div>
                    <a
                        href="https://github.com/Innit-Bruv/Time-Read"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] uppercase tracking-[0.2em] font-medium text-accent/60 hover:text-accent transition-colors"
                    >
                        GitHub →
                    </a>
                </header>

                {view === "home" && (
                    <>
                        <TimeSelector value={timeBudget} onChange={setTimeBudget} />

                        <div className="pt-2 md:pt-4 flex justify-center">
                            <button
                                className="group flex items-center justify-center gap-3 w-full max-w-sm px-10 py-5 bg-transparent border-2 border-accent/30 rounded-full text-accent hover:bg-accent hover:text-[#0f0f0f] transition-all duration-500 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-accent"
                                disabled={!timeBudget}
                                onClick={() => {
                                    const items = getDemoPackForBudget(timeBudget!);
                                    setPackItems(items);
                                    setView("pack");
                                }}
                            >
                                <span className="uppercase tracking-[0.25em] text-sm md:text-base font-bold">
                                    Begin Reading
                                </span>
                                <span className="text-lg transition-transform group-hover:translate-x-2">→</span>
                            </button>
                        </div>

                        <p className="text-center text-[10px] text-accent/30 uppercase tracking-widest pt-2">
                            Demo mode — no sign-in required
                        </p>
                    </>
                )}

                {view === "pack" && (
                    <>
                        <PackTimeline
                            items={packItems}
                            totalMinutes={totalTime}
                            targetMinutes={timeBudget!}
                            onStartReading={() => setView("reading")}
                            onCustomize={() => setView("home")}
                        />
                    </>
                )}
            </div>
        </main>
    );
}
