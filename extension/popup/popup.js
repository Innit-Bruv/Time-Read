/**
 * TimeRead Extension — Popup Script
 * Handles save flow and settings management.
 */

// DOM elements
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

// Init: get current tab info
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
        pageTitle.textContent = tab.title || "Untitled";
        pageUrl.textContent = tab.url || "";
    }
});

// Check if settings exist
chrome.storage.local.get(["apiUrl", "token"], (result) => {
    if (!result.apiUrl || !result.token) {
        showStatus(status, "Configure your token in Settings first", "error");
        saveBtn.disabled = true;
    }
});

// Save button
saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    showStatus(status, "Saving to TimeRead...", "loading");

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    chrome.runtime.sendMessage(
        { type: "SAVE_URL", url: tab.url, title: tab.title },
        (response) => {
            if (response?.success) {
                const time = response.time ? `${Math.round(response.time)} min read` : "";
                showStatus(status, `✓ Saved${time ? " — " + time : ""}`, "success");
                saveBtn.textContent = "Saved ✓";
            } else {
                showStatus(status, response?.error || "Failed to save", "error");
                saveBtn.textContent = "Save to TimeRead";
                saveBtn.disabled = false;
            }
        }
    );
});

// Settings navigation
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

// Save settings
saveSettingsBtn.addEventListener("click", () => {
    const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
    const token = apiTokenInput.value.trim();

    if (!apiUrl || !token) {
        showStatus(settingsStatus, "Both fields are required", "error");
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

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = `status ${type}`;
    el.classList.remove("hidden");
}
