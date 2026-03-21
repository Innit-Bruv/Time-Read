/**
 * TimeRead Extension — Background Service Worker
 * Handles content status polling, context menu, and auto-sync.
 */

// ═══════════════════════════════════════════
// CONTEXT MENU (Feature 1 — Right-click save)
// ═══════════════════════════════════════════
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "timeread-save-link",
        title: "Save to TimeRead",
        contexts: ["link"],
    });
    chrome.contextMenus.create({
        id: "timeread-save-page",
        title: "Save this page to TimeRead",
        contexts: ["page"],
    });

    // Set up auto-sync alarm (Feature 4)
    chrome.alarms.create("twitter-bookmark-sync", { periodInMinutes: 60 });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "timeread-save-link") {
        const url = info.linkUrl;
        const title = info.selectionText || url;
        handleSave(url, title).then((result) => {
            // Show a badge on the extension icon temporarily
            if (result.success) {
                chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tab.id });
            } else {
                chrome.action.setBadgeText({ text: "✗", tabId: tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#f44336", tabId: tab.id });
            }
            setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 3000);
        });
    }
    if (info.menuItemId === "timeread-save-page") {
        handleSave(tab.url, tab.title).then((result) => {
            if (result.success) {
                chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tab.id });
            } else {
                chrome.action.setBadgeText({ text: "✗", tabId: tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#f44336", tabId: tab.id });
            }
            setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 3000);
        });
    }
});

// ═══════════════════════════════════════════
// AUTO-SYNC TWITTER BOOKMARKS (Feature 4)
// ═══════════════════════════════════════════
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "twitter-bookmark-sync") {
        autoSyncTwitterBookmarks();
    }
});

async function autoSyncTwitterBookmarks() {
    const { apiUrl, token, twitterAutoSync } = await chrome.storage.local.get([
        "apiUrl", "token", "twitterAutoSync"
    ]);

    // Only sync if enabled and configured
    if (!twitterAutoSync || !apiUrl || !token) return;

    console.log("[TimeRead] Auto-syncing Twitter bookmarks...");

    // We can't scrape from background — instead, we inject a script into
    // any open twitter bookmarks tab. If none is open, skip this cycle.
    const tabs = await chrome.tabs.query({ url: ["*://twitter.com/i/bookmarks*", "*://x.com/i/bookmarks*"] });

    if (tabs.length > 0) {
        // Send message to content script to trigger auto-import
        chrome.tabs.sendMessage(tabs[0].id, { type: "AUTO_IMPORT" });
        console.log("[TimeRead] Triggered auto-import on tab", tabs[0].id);
    } else {
        console.log("[TimeRead] No Twitter bookmark tab open, skipping auto-sync");
    }
}

// ═══════════════════════════════════════════
// CORE SAVE LOGIC
// ═══════════════════════════════════════════

// Poll content status after save
async function pollStatus(contentId, apiUrl, token) {
    const MAX_POLLS = 15; // 30s max
    const POLL_INTERVAL = 2000;

    for (let i = 0; i < MAX_POLLS; i++) {
        try {
            const response = await fetch(`${apiUrl}/content/${contentId}/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data.status === "ready") {
                return {
                    success: true,
                    title: data.title,
                    time: data.estimated_time,
                };
            } else if (data.status === "failed") {
                return {
                    success: false,
                    error: data.error_message || "Failed to extract",
                };
            }

            // Still processing, wait and retry
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        } catch (err) {
            console.error("Poll error:", err);
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        }
    }

    return { success: false, error: "Timed out waiting for processing" };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SAVE_URL") {
        handleSave(request.url, request.title).then(sendResponse);
        return true; // Keep channel open for async response
    }
    if (request.type === "GET_SETTINGS") {
        chrome.storage.local.get(["apiUrl", "token", "twitterAutoSync"], (result) => {
            sendResponse(result);
        });
        return true;
    }
    if (request.type === "TOGGLE_TWITTER_SYNC") {
        chrome.storage.local.set({ twitterAutoSync: request.enabled });
        sendResponse({ ok: true });
        return true;
    }
});

async function handleSave(url, title) {
    const { apiUrl, token } = await chrome.storage.local.get(["apiUrl", "token"]);

    if (!apiUrl || !token) {
        return { success: false, error: "Configure your TimeRead token in settings" };
    }

    try {
        // POST /ingest
        const response = await fetch(`${apiUrl}/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url, title }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "ready") {
            return { success: true, message: "Already saved", title: data.title };
        }

        // Poll for processing completion
        const result = await pollStatus(data.content_id, apiUrl, token);
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
}
