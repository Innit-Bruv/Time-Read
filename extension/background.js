/**
 * TimeRead Extension — Background Service Worker
 * Handles save queue, status polling, context menu, and badge updates.
 *
 * Queue entry shape:
 *   { id: string, url: string, title: string,
 *     status: "pending"|"processing"|"done"|"failed",
 *     error?: string, savedAt: number, estimatedTime?: number }
 */

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // 60s max per item
const QUEUE_KEY = "saveQueue";

// ═══════════════════════════════════════════
// CONTEXT MENU
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

    // Auto-sync alarm
    chrome.alarms.create("twitter-bookmark-sync", { periodInMinutes: 60 });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "timeread-save-link") {
        // Save the right-clicked link URL (not the current page)
        const url = info.linkUrl;
        const title = info.selectionText || url;
        handleSave(url, title);
    }
    if (info.menuItemId === "timeread-save-page") {
        handleSave(tab.url, tab.title);
    }
});

// ═══════════════════════════════════════════
// AUTO-SYNC TWITTER BOOKMARKS
// ═══════════════════════════════════════════
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "twitter-bookmark-sync") {
        autoSyncTwitterBookmarks();
    }
});

async function autoSyncTwitterBookmarks() {
    const { apiUrl, token, twitterAutoSync } = await chrome.storage.local.get([
        "apiUrl", "token", "twitterAutoSync",
    ]);
    if (!twitterAutoSync || !apiUrl || !token) return;

    const tabs = await chrome.tabs.query({
        url: ["*://twitter.com/i/bookmarks*", "*://x.com/i/bookmarks*"],
    });
    if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "AUTO_IMPORT" });
    }
}

// ═══════════════════════════════════════════
// MESSAGE LISTENER
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SAVE_URL") {
        handleSave(request.url, request.title).then(sendResponse);
        return true;
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
    if (request.type === "GET_QUEUE") {
        getQueue().then((queue) => sendResponse({ queue }));
        return true;
    }
    if (request.type === "RETRY_ITEM") {
        retryItem(request.itemId).then(sendResponse);
        return true;
    }
    if (request.type === "CLEAR_DONE") {
        clearDoneItems().then(() => sendResponse({ ok: true }));
        return true;
    }
});

// ═══════════════════════════════════════════
// QUEUE STORAGE HELPERS
// ═══════════════════════════════════════════
async function getQueue() {
    const data = await chrome.storage.local.get(QUEUE_KEY);
    return data[QUEUE_KEY] || [];
}

async function setQueue(queue) {
    try {
        await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    } catch (err) {
        // QuotaExceededError — prune done items and retry once
        if (err.name === "QuotaExceededError" || (err.message && err.message.includes("QUOTA_BYTES"))) {
            const pruned = queue.filter((item) => item.status !== "done");
            try {
                await chrome.storage.local.set({ [QUEUE_KEY]: pruned });
            } catch (e2) {
                console.error("[TimeRead] Queue storage quota exceeded even after pruning:", e2);
            }
        } else {
            console.error("[TimeRead] setQueue error:", err);
        }
    }
}

async function updateItem(id, patch) {
    const queue = await getQueue();
    const idx = queue.findIndex((item) => item.id === id);
    if (idx === -1) return;
    queue[idx] = { ...queue[idx], ...patch };
    await setQueue(queue);
    updateBadge(queue);
}

async function clearDoneItems() {
    const queue = await getQueue();
    const active = queue.filter((item) => item.status !== "done");
    await setQueue(active);
    updateBadge(active);
}

// ═══════════════════════════════════════════
// BADGE
// ═══════════════════════════════════════════
function updateBadge(queue) {
    const pending = queue.filter((i) => i.status === "pending" || i.status === "processing").length;
    const failed = queue.filter((i) => i.status === "failed").length;

    if (failed > 0) {
        chrome.action.setBadgeText({ text: String(failed) });
        chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
    } else if (pending > 0) {
        chrome.action.setBadgeText({ text: String(pending) });
        chrome.action.setBadgeBackgroundColor({ color: "#FF9800" });
    } else {
        chrome.action.setBadgeText({ text: "" });
    }
}

// ═══════════════════════════════════════════
// CORE SAVE + POLL LOGIC
// ═══════════════════════════════════════════
async function handleSave(url, title) {
    const { apiUrl, token } = await chrome.storage.local.get(["apiUrl", "token"]);

    if (!apiUrl) {
        return { success: false, error: "Configure your TimeRead API URL in settings" };
    }

    // Generate a temporary local ID for queue tracking
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Add to queue as pending
    const queue = await getQueue();
    const entry = {
        id: localId,
        url,
        title: title || url,
        status: "pending",
        savedAt: Date.now(),
    };
    queue.push(entry);
    await setQueue(queue);
    updateBadge(queue);

    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const response = await fetch(`${apiUrl}/api/ingest`, {
            method: "POST",
            headers,
            body: JSON.stringify({ url, title }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "ready") {
            await updateItem(localId, {
                id: data.content_id,
                status: "done",
                title: data.title || title || url,
            });
            return { success: true, message: "Already saved" };
        }

        // Mark processing with real content_id, swap local ID
        const realId = data.content_id;
        const currentQueue = await getQueue();
        const idx = currentQueue.findIndex((i) => i.id === localId);
        if (idx !== -1) {
            currentQueue[idx] = { ...currentQueue[idx], id: realId, status: "processing" };
            await setQueue(currentQueue);
            updateBadge(currentQueue);
        }

        // Poll for completion
        const result = await pollUntilDone(realId, apiUrl, token);
        return result;
    } catch (err) {
        await updateItem(localId, { status: "failed", error: err.message });
        return { success: false, error: err.message };
    }
}

async function pollUntilDone(contentId, apiUrl, token) {
    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
            const response = await fetch(`${apiUrl}/api/content/${contentId}/status`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data.status === "ready") {
                await updateItem(contentId, {
                    status: "done",
                    title: data.title,
                    estimatedTime: data.estimated_time,
                });
                return { success: true, title: data.title, time: data.estimated_time };
            } else if (data.status === "failed") {
                const errorMsg = data.error_message || "Failed to extract content";
                await updateItem(contentId, { status: "failed", error: errorMsg });
                return { success: false, error: errorMsg };
            }
            // still processing — update title if we got one
            if (data.title) {
                await updateItem(contentId, { title: data.title });
            }
        } catch (err) {
            console.error("[TimeRead] Poll error:", err);
        }
    }

    const timeoutMsg = "Timed out waiting for processing";
    await updateItem(contentId, { status: "failed", error: timeoutMsg });
    return { success: false, error: timeoutMsg };
}

async function retryItem(itemId) {
    const queue = await getQueue();
    const item = queue.find((i) => i.id === itemId);
    if (!item) return { success: false, error: "Item not found" };

    // Remove old entry and re-save
    const filtered = queue.filter((i) => i.id !== itemId);
    await setQueue(filtered);
    updateBadge(filtered);

    return handleSave(item.url, item.title);
}
