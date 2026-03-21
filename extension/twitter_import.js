/**
 * TimeRead Extension — Twitter Bookmark Import
 * 
 * Content script that detects bookmark pages and injects an import button.
 * Injected on twitter.com/i/bookmarks and x.com/i/bookmarks.
 */

(function () {
    // Only run on bookmark pages
    if (!window.location.pathname.includes("/i/bookmarks")) return;

    // Prevent double-injection
    if (document.getElementById("timeread-import-btn")) return;

    // Inject "Import to TimeRead" button
    const btn = document.createElement("button");
    btn.id = "timeread-import-btn";
    btn.textContent = "📚 Import to TimeRead";
    btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    padding: 12px 20px;
    background: #e8d5b0;
    color: #0f0f0f;
    border: none;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  `;

    btn.addEventListener("click", handleImport);
    document.body.appendChild(btn);

    // Listen for auto-import from background alarm (Feature 4)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "AUTO_IMPORT") {
            console.log("[TimeRead] Auto-import triggered by alarm");
            handleImport();
            sendResponse({ ok: true });
        }
        return true;
    });

    async function handleImport() {
        btn.disabled = true;
        btn.textContent = "🔍 Scanning bookmarks...";

        // Scrape visible bookmark tweets
        const tweets = scrapeBookmarks();
        const qualifying = filterQualifying(tweets);

        if (qualifying.length === 0) {
            btn.textContent = "No qualifying content found";
            setTimeout(() => {
                btn.textContent = "📚 Import to TimeRead";
                btn.disabled = false;
            }, 2000);
            return;
        }

        // Show confirmation
        const confirmed = confirm(
            `Found ${qualifying.length} qualifying items (threads, long tweets, article links).\n\nImport to TimeRead?`
        );

        if (!confirmed) {
            btn.textContent = "📚 Import to TimeRead";
            btn.disabled = false;
            return;
        }

        // Batch import with delay
        btn.textContent = `Importing 0/${qualifying.length}...`;
        let imported = 0;

        for (let i = 0; i < qualifying.length; i += 20) {
            const batch = qualifying.slice(i, i + 20);
            for (const tweet of batch) {
                try {
                    chrome.runtime.sendMessage({
                        type: "SAVE_URL",
                        url: tweet.url,
                        title: tweet.text?.substring(0, 100) || "Twitter Bookmark",
                    });
                    imported++;
                    btn.textContent = `Importing ${imported}/${qualifying.length}...`;
                } catch (err) {
                    console.error("Import error:", err);
                }
                // 500ms delay between items
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        btn.textContent = `✓ Imported ${imported} items`;
        setTimeout(() => {
            btn.textContent = "📚 Import to TimeRead";
            btn.disabled = false;
        }, 3000);
    }

    function scrapeBookmarks() {
        const tweets = [];
        const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');

        tweetElements.forEach((el) => {
            const linkEl = el.querySelector('a[href*="/status/"]');
            const textEl = el.querySelector('[data-testid="tweetText"]');
            const url = linkEl ? `https://x.com${linkEl.getAttribute("href")}` : null;
            const text = textEl ? textEl.textContent : "";

            // Check for external links
            const externalLinks = Array.from(el.querySelectorAll('a[href*="t.co"]'))
                .map((a) => a.getAttribute("href"))
                .filter(Boolean);

            if (url) {
                tweets.push({
                    url,
                    text,
                    hasExternalLinks: externalLinks.length > 0,
                    isLong: text.length > 280,
                });
            }
        });

        return tweets;
    }

    function filterQualifying(tweets) {
        // Import filter rules per PRD Section 15:
        // - is_thread (same author, ≥2 tweets) — simplified: threads have /status/ in URL
        // - contains external article URL
        // - tweet length > 280 chars
        return tweets.filter((t) => t.hasExternalLinks || t.isLong);
    }
})();
