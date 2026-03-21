import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const feedUrl = searchParams.get("url");

    if (!feedUrl) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    try {
        // Use rss2json as a proxy to parse RSS feeds
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
        const res = await fetch(proxyUrl, { next: { revalidate: 300 } }); // Cache for 5 min
        const data = await res.json();

        if (data.status !== "ok") {
            return NextResponse.json({ error: "Invalid RSS feed" }, { status: 422 });
        }

        const entries = data.items.slice(0, 15).map((item: { title: string; link: string; pubDate: string }) => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
        }));

        return NextResponse.json({ entries, feedTitle: data.feed?.title || "" });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to fetch feed" },
            { status: 500 }
        );
    }
}
