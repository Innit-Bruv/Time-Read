/**
 * TimeRead Extension — Popup Script
 * Handles save flow, settings, and the save queue UI.
 */

// ═══════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════
const mainView = document.getElementById("main-view");
const settingsView = document.getElementById("settings-view");
const pageTitle = document.getElementById("page-title");
const pageUrl = document.getElementById("page-url");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");
const settingsBtn = document.getElementById("settings-btn");
const backBtn = document.getElementById("back-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const apiUrlInput = document.getElementById("api-url");
const apiTokenInput = document.getElementById("api-token");
const twitterSyncToggle = document.getElementById("twitter-sync");
const settingsStatus = document.getElementById("settings-status");

const tabSaveBtn = document.getElementById("tab-save");
const tabQueueBtn = document.getElementById("tab-queue");
const saveTab = document.getElementById("save-tab");
const queueTab = document.getElementById("queue-tab");
const queueList = document.getElementById("queue-list");
const queueEmpty = document.getElementById("queue-empty");
const queueBadge = document.getElementById("queue-badge");
const clearDoneBtn = document.getElementById("clear-done-btn");

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
        pageTitle.textContent = tab.title || "Untitled";
        pageUrl.textContent = tab.url || "";
    }
});

chrome.storage.local.get(["apiUrl"], (result) => {
    if (!result.apiUrl) {
        showStatus(status, "Configure your API URL in Settings first", "error");
        saveBtn.disabled = true;
    }
});

// Load queue on open
loadQueue();

// ═══════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════
tabSaveBtn.addEventListener("click", () => switchTab("save"));
tabQueueBtn.addEventListener("click", () => switchTab("queue"));

function switchTab(tab) {
    if (tab === "save") {
        tabSaveBtn.classList.add("active");
        tabQueueBtn.classList.remove("active");
        saveTab.classList.remove("hidden");
        queueTab.classList.add("hidden");
    } else {
        tabQueueBtn.classList.add("active");
        tabSaveBtn.classList.remove("active");
        queueTab.classList.remove("hidden");
        saveTab.classList.add("hidden");
    }
}

// ═══════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════
saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    showStatus(status, "Queued — processing in background ✓", "loading");

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    // Delegate to background queue engine
    chrome.runtime.sendMessage(
        { type: "SAVE_URL", url: tab.url, title: tab.title },
        () => {
            // Response comes back when processing is done, but popup may be closed by then.
            // The background handles updating the queue — we just close.
        }
    );

    saveBtn.textContent = "Queued ✓";
    // Switch to queue tab so user can see progress
    switchTab("queue");
    loadQueue();
});

// ═══════════════════════════════════════════
// QUEUE RENDERING
// ═══════════════════════════════════════════
async function loadQueue() {
    chrome.runtime.sendMessage({ type: "GET_QUEUE" }, ({ queue }) => {
        renderQueue(queue || []);
    });
}

function renderQueue(queue) {
    // Count active/failed for badge
    const active = queue.filter((i) => i.status === "pending" || i.status === "processing").length;
    const failed = queue.filter((i) => i.status === "failed").length;
    const done = queue.filter((i) => i.status === "done").length;

    // Update tab badge
    const badgeCount = failed > 0 ? failed : active;
    if (badgeCount > 0) {
        queueBadge.textContent = badgeCount;
        queueBadge.classList.remove("hidden");
        queueBadge.style.background = failed > 0 ? "#f44336" : "#FF9800";
        // Auto-switch to queue if there are active or failed items
        if (active > 0 || failed > 0) switchTab("queue");
    } else {
        queueBadge.classList.add("hidden");
    }

    // Clear done button
    if (done > 0) {
        clearDoneBtn.classList.remove("hidden");
    } else {
        clearDoneBtn.classList.add("hidden");
    }

    if (queue.length === 0) {
        queueEmpty.classList.remove("hidden");
        // Remove any existing item elements
        [...queueList.querySelectorAll(".queue-item")].forEach((el) => el.remove());
        return;
    }

    queueEmpty.classList.add("hidden");

    // Re-render the list (simple approach: clear and rebuild)
    [...queueList.querySelectorAll(".queue-item")].forEach((el) => el.remove());

    // Most recent first
    const sorted = [...queue].reverse();
    for (const item of sorted) {
        queueList.appendChild(buildQueueItem(item));
    }
}

function buildQueueItem(item) {
    const el = document.createElement("div");
    el.className = `queue-item status-${item.status}`;
    el.dataset.id = item.id;

    const icon = { pending: "⏳", processing: "🔄", done: "✓", failed: "✗" }[item.status] || "•";
    const titleText = (item.title || item.url || "Unknown").slice(0, 60);

    let meta = "";
    if (item.status === "pending") meta = "Queued...";
    else if (item.status === "processing") meta = "Processing...";
    else if (item.status === "done" && item.estimatedTime) meta = `~${Math.round(item.estimatedTime)} min read`;
    else if (item.status === "done") meta = "Saved";
    else if (item.status === "failed") meta = (item.error || "Failed").slice(0, 80);

    el.innerHTML = `
        <div class="qi-icon">${icon}</div>
        <div class="qi-body">
            <div class="qi-title">${escapeHtml(titleText)}</div>
            <div class="qi-meta">${escapeHtml(meta)}</div>
            ${item.status === "failed" ? `<button class="qi-retry" data-id="${item.id}">Try again</button>` : ""}
        </div>
    `;

    if (item.status === "failed") {
        el.querySelector(".qi-retry").addEventListener("click", () => retryItem(item.id));
    }

    return el;
}

function retryItem(itemId) {
    chrome.runtime.sendMessage({ type: "RETRY_ITEM", itemId }, () => {
        loadQueue();
    });
}

clearDoneBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_DONE" }, () => {
        loadQueue();
    });
});

// ═══════════════════════════════════════════
// REACTIVE UPDATES via storage.onChanged
// ═══════════════════════════════════════════
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.saveQueue) {
        renderQueue(changes.saveQueue.newValue || []);
    }
});

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
settingsBtn.addEventListener("click", () => {
    mainView.classList.add("hidden");
    settingsView.classList.remove("hidden");

    chrome.storage.local.get(["apiUrl", "token", "twitterAutoSync"], (result) => {
        apiUrlInput.value = result.apiUrl || "";
        apiTokenInput.value = result.token || "";
        twitterSyncToggle.checked = result.twitterAutoSync || false;
    });
});

backBtn.addEventListener("click", () => {
    settingsView.classList.add("hidden");
    mainView.classList.remove("hidden");
});

saveSettingsBtn.addEventListener("click", () => {
    const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
    const token = apiTokenInput.value.trim();

    if (!apiUrl) {
        showStatus(settingsStatus, "API URL is required", "error");
        return;
    }

    chrome.storage.local.set({ apiUrl, token, twitterAutoSync: twitterSyncToggle.checked }, () => {
        showStatus(settingsStatus, "Settings saved ✓", "success");
        saveBtn.disabled = false;
        setTimeout(() => {
            settingsView.classList.add("hidden");
            mainView.classList.remove("hidden");
        }, 1000);
    });
});

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function showStatus(el, message, type) {
    el.textContent = message;
    el.className = `status ${type}`;
    el.classList.remove("hidden");
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
