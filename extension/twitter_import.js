/**
 * TimeRead Extension — Twitter Bookmark Import
 *
 * Content script injected on twitter.com/i/bookmarks and x.com/i/bookmarks.
 * Injects an "Import to TimeRead" button and imports bookmarks sequentially
 * to avoid hammering the backend.
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

    // Listen for auto-import from background alarm
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "AUTO_IMPORT") {
            console.log("[TimeRead] Auto-import triggered by alarm");
            handleImport();
            sendResponse({ ok: true });
        }
        return true;
    });

    /** Send a SAVE_URL message and wait for the background to respond. */
    function saveUrl(url, title) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "SAVE_URL", url, title }, (response) => {
                resolve(response || { success: false, error: "No response from background" });
            });
        });
    }

    async function handleImport() {
        btn.disabled = true;
        btn.textContent = "🔍 Scanning bookmarks...";

        const tweets = scrapeBookmarks();

        if (tweets.length === 0) {
            btn.textContent = "No bookmarks visible";
            setTimeout(() => {
                btn.textContent = "📚 Import to TimeRead";
                btn.disabled = false;
            }, 2000);
            return;
        }

        const confirmed = confirm(
            `Found ${tweets.length} thread${tweets.length !== 1 ? "s" : ""} / article${tweets.length !== 1 ? "s" : ""} visible on screen.\n\nImport all to TimeRead?`
        );

        if (!confirmed) {
            btn.textContent = "📚 Import to TimeRead";
            btn.disabled = false;
            return;
        }

        // Sequential import — one at a time, wait for each to complete
        let imported = 0;
        let failed = 0;

        for (let i = 0; i < tweets.length; i++) {
            const tweet = tweets[i];
            btn.textContent = `Saving ${i + 1}/${tweets.length}...`;
            try {
                const result = await saveUrl(tweet.url, tweet.text?.substring(0, 100) || "Twitter Bookmark");
                if (result.success) {
                    imported++;
                } else {
                    failed++;
                    console.warn("[TimeRead] Failed to save:", tweet.url, result.error);
                }
            } catch (err) {
                failed++;
                console.error("[TimeRead] Import error:", err);
            }
        }

        btn.textContent = `✓ Saved ${imported}${failed > 0 ? ` (${failed} failed)` : ""}`;
        setTimeout(() => {
            btn.textContent = "📚 Import to TimeRead";
            btn.disabled = false;
        }, 4000);
    }

    function scrapeBookmarks() {
        const items = [];
        const seen = new Set();

        // 1. X Articles (Twitter Notes) — url pattern: x.com/i/article/...
        document.querySelectorAll('a[href*="/i/article/"]').forEach((link) => {
            const href = link.getAttribute("href");
            const url = href.startsWith("http") ? href : `https://x.com${href}`;
            if (!seen.has(url)) {
                seen.add(url);
                items.push({ url, text: link.textContent?.trim() || "X Article" });
            }
        });

        // 2. Twitter/X threads only — skip standalone single tweets
        document.querySelectorAll('article[data-testid="tweet"]').forEach((el) => {
            const linkEl = el.querySelector('a[href*="/status/"]');
            const textEl = el.querySelector('[data-testid="tweetText"]');
            if (!linkEl) return;

            const url = `https://x.com${linkEl.getAttribute("href")}`;
            if (seen.has(url)) return;

            const text = textEl ? textEl.textContent : "";

            if (_isThread(el, text)) {
                seen.add(url);
                items.push({ url, text });
            }
        });

        return items;
    }

    /**
     * Heuristic thread detector. Checks for three common signals:
     *   1. "Show this thread" link rendered by X inside the card
     *   2. Thread-numbering prefix (e.g. "1/" or "1/10")
     *   3. Explicit thread marker ("🧵" or "Thread:")
     */
    function _isThread(el, text) {
        if (el.textContent.includes("Show this thread")) return true;
        if (/^\s*1\//.test(text)) return true;
        if (/^(🧵|thread:)/i.test(text.trim())) return true;
        return false;
    }
})();
