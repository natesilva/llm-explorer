const contextInput = document.getElementById('context-window');
const candidatesList = document.getElementById('candidates-list');
const tempSlider = document.getElementById('temp-slider');
const topkSlider = document.getElementById('topk-slider');
const toppSlider = document.getElementById('topp-slider');
const penaltySlider = document.getElementById('penalty-slider');
const themeToggleBtn = document.getElementById('theme-toggle');
const starterSelect = document.getElementById('starter-select');
const clearContextBtn = document.getElementById('clear-context');
const syntaxToggleBtn = document.getElementById('syntax-toggle');
const autoInferBtn = document.getElementById('auto-infer');

// Chat mode elements
const modeToggles = document.querySelectorAll('.mode-toggle');
const contextMode = document.getElementById('context-mode');
const chatMode = document.getElementById('chat-mode');
const systemPromptInput = document.getElementById('system-prompt');
const systemPresetSelect = document.getElementById('system-preset-select');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatUserInput = document.getElementById('chat-user-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// State
let debounceTimer;
let autoInferRunning = false;
let isLoadingCandidates = false;
let currentCandidates = [];
let pendingSelection = null;  // Track scheduled token selection to prevent duplicates
let isSelectingToken = false;  // Prevent concurrent selectToken calls
let selectionTimeoutId = null;  // Store timeout ID to clear if needed
let lastSelectedToken = null;  // Prevent selecting the same token twice
let candidatesGenerationId = 0;  // Track which "batch" of candidates we're using
let consecutiveErrors = 0;  // Track consecutive API errors

// Downloads state
let downloads = {};
let downloadPollInterval = null;

// Beam search state
let beamPaths = [];
let isBeamLoading = false;
let beamLastContext = '';  // Track context used for current paths

// Chat mode state
let currentMode = 'context';  // 'context' or 'chat'
let chatMessages = [];  // Array of {role: 'user'|'assistant', content: string}
let isGeneratingResponse = false;

// Syntax highlighting state
let syntaxHighlightEnabled = false;
let currentAssistantContent = '';
let isFirstAssistantToken = false;  // Track first token to strip leading whitespace

// Theme switching
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// Initialize theme on load
initTheme();

// Theme toggle event listener
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
}

// Syntax toggle event listener
if (syntaxToggleBtn) {
    syntaxToggleBtn.addEventListener('click', toggleSyntaxHighlighting);
}

// Mode toggles
modeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        switchMode(mode);
    });
});

function switchMode(mode) {
    // Stop auto-inference if running
    if (autoInferRunning) {
        stopAutoInfer();
    }

    currentMode = mode;
    modeToggles.forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    if (mode === 'context') {
        contextMode.classList.remove('hidden');
        contextMode.classList.add('active');
        chatMode.classList.remove('active');
        chatMode.classList.add('hidden');
        // Sync chat messages to context textarea
        syncChatToContext();
        // Refresh candidates for the context
        fetchCandidates();
    } else {
        chatMode.classList.remove('hidden');
        chatMode.classList.add('active');
        contextMode.classList.remove('active');
        contextMode.classList.add('hidden');
        // Sync context textarea to chat (if it looks like chat format)
        syncContextToChat();
        renderChatMessages();
        // In chat mode, only show candidates if we have messages (user + assistant)
        // If waiting for user input, clear candidates
        if (chatMessages.length === 0 && !isGeneratingResponse) {
            candidatesList.innerHTML = '<div class="chat-empty-state">Send a message to see predictions</div>';
            currentCandidates = [];
        } else {
            // Sync to context and fetch candidates
            syncChatToContext();
            fetchCandidates();
        }
    }
}

// Starter text dropdown
if (starterSelect) {
    starterSelect.addEventListener('change', (e) => {
        contextInput.value = e.target.value;
        starterSelect.value = '';

        // Always fetch candidates so tokens view is updated when switching back
        fetchCandidates();

        // Also refresh beam paths if in beam view
        const inBeamView = beamView.classList.contains('active');
        if (inBeamView) {
            scheduleBeamGenerate();
        }

        updateSyntaxHighlight();

        contextInput.focus();
    });
}

// Clear context button
if (clearContextBtn) {
    clearContextBtn.addEventListener('click', () => {
        if (currentMode === 'chat') {
            // Clear chat state
            chatMessages = [];
            currentAssistantContent = '';
            isGeneratingResponse = false;
            chatUserInput.disabled = false;
            chatSendBtn.disabled = false;
            renderChatMessages();
            syncChatToContext();
        } else {
            // Clear context textarea
            contextInput.value = '';
        }
        candidatesList.innerHTML = '';
        currentCandidates = [];

        // Clear beam paths if in beam view
        if (beamView.classList.contains('active')) {
            beamPaths = [];
            beamLastContext = '';
            beamPathsGrid.innerHTML = '<div class="beam-empty-state"><p>Enter some context first</p></div>';
        }

        updateSyntaxHighlight();

        if (currentMode === 'context') {
            contextInput.focus();
        } else {
            chatUserInput.focus();
        }
    });
}

// Auto-inference
const TOP_TOKENS_PER_SECOND = 5;

if (autoInferBtn) {
    autoInferBtn.addEventListener('click', () => {
        if (autoInferRunning) {
            stopAutoInfer();
        } else {
            startAutoInfer();
        }
    });
}

function weightedRandom(candidates) {
    const total = candidates.reduce((sum, c) => sum + c.prob, 0);
    let rand = Math.random() * total;
    for (const c of candidates) {
        rand -= c.prob;
        if (rand <= 0) return c;
    }
    return candidates[candidates.length - 1];
}

function flashSelectedToken(token) {
    const items = candidatesList.querySelectorAll('.candidate-item');
    for (const item of items) {
        if (item.dataset.token === token) {
            item.classList.add('selected', 'flash');
            setTimeout(() => {
                item.classList.remove('selected', 'flash');
            }, 150);
            break;
        }
    }
}

function startAutoInfer() {
    autoInferRunning = true;
    autoInferBtn.textContent = '■';
    autoInferBtn.title = 'Stop auto-inference';
    pendingSelection = null;
    lastSelectedToken = null;
    candidatesGenerationId = 0;
    consecutiveErrors = 0;  // Reset error counter
    if (selectionTimeoutId) {
        clearTimeout(selectionTimeoutId);
        selectionTimeoutId = null;
    }

    autoInferInterval = setInterval(() => {
        if (isLoadingCandidates || pendingSelection || isSelectingToken) return;
        if (!currentCandidates.length) {
            fetchCandidates();
            return;
        }
        // Filter out the last selected token to prevent immediate repeats
        const eligible = currentCandidates.filter(c =>
            !c.excluded && c.token !== lastSelectedToken
        );
        if (!eligible.length) return;  // No eligible tokens

        const selected = weightedRandom(eligible);
        const scheduledGenId = candidatesGenerationId;
        pendingSelection = { token: selected.token, genId: scheduledGenId };
        flashSelectedToken(selected.token);
        selectionTimeoutId = setTimeout(() => {
            selectionTimeoutId = null;
            if (!autoInferRunning || isLoadingCandidates || isSelectingToken) {
                pendingSelection = null;
                return;
            }
            // Only proceed if we're still on the same generation of candidates
            if (pendingSelection && pendingSelection.genId === scheduledGenId) {
                selectToken(pendingSelection.token);
                pendingSelection = null;
            }
        }, 150);
    }, 1000 / TOP_TOKENS_PER_SECOND);
}

function stopAutoInfer() {
    autoInferRunning = false;
    autoInferBtn.textContent = '▶';
    autoInferBtn.title = 'Auto-inference';
    clearInterval(autoInferInterval);
    autoInferInterval = null;
    pendingSelection = null;
    lastSelectedToken = null;
    if (selectionTimeoutId) {
        clearTimeout(selectionTimeoutId);
        selectionTimeoutId = null;
    }
}

async function fetchCandidates() {
    const text = contextInput.value;
    if (!text) return;
    isLoadingCandidates = true;

    try {
        const response = await fetch('/next-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                temp: parseFloat(tempSlider.value),
                top_k: parseInt(topkSlider.value),
                top_p: parseFloat(toppSlider.value),
                repeat_penalty: parseFloat(penaltySlider.value)
            })
        });

        if (!response.ok) {
            let errorMsg = "API Error: " + response.status;
            try {
                const errData = await response.json();
                if (errData.detail) {
                    errorMsg = errData.detail;
                }
            } catch (_) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        consecutiveErrors = 0;  // Reset error counter on success
        renderCandidates(data.candidates);
    } catch (e) {
        console.error('[AutoInfer] Fetch error:', e.message);
        consecutiveErrors++;
        // Stop auto-infer after 2 consecutive errors to prevent repetition loop
        if (consecutiveErrors >= 2 && autoInferRunning) {
            console.error('[AutoInfer] Stopping due to consecutive errors');
            stopAutoInfer();
            alert('Auto-inference stopped due to API error: ' + e.message);
        }
    } finally {
        isLoadingCandidates = false;
    }
}

function getProbColor(prob) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const hue = 265 - (prob * 0.6);
    const sat = isLight ? 20 + prob * 0.6 : 35 + prob * 0.5;
    const light = isLight ? 52 - prob * 0.2 : 52 - prob * 0.15;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function renderCandidates(candidates) {
    candidatesList.innerHTML = '';
    currentCandidates = candidates;
    candidatesGenerationId++;  // New batch of candidates
    console.log('[AutoInfer] New candidates, generation:', candidatesGenerationId, 'lastSelected:', lastSelectedToken);

    candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = 'candidate-item';
        if (c.excluded) {
            div.classList.add('excluded');
        }
        div.onclick = () => selectToken(c.token);

        const barColor = getProbColor(c.prob);

        div.innerHTML = `
            <span class="token-text">${escapeHtml(c.token)}</span>
            <div class="prob-bar-container">
                <div class="prob-bar" style="width: ${c.prob}%; background-color: ${barColor}"></div>
            </div>
            <span class="prob-text">${c.prob.toFixed(1)}%</span>
        `;
        div.dataset.token = c.token;
        div.dataset.prob = c.prob;
        candidatesList.appendChild(div);
    });
}

async function selectToken(token) {
    if (isSelectingToken) {
        console.log('[AutoInfer] selectToken blocked, already selecting');
        return;  // Prevent concurrent calls
    }
    isSelectingToken = true;
    console.log('[AutoInfer] Selecting token:', repr(token), 'genId:', candidatesGenerationId);

    // Get the text to check for end tokens
    let textForEndCheck;

    if (currentMode === 'chat' && isGeneratingResponse) {
        // Chat mode: append to assistant response
        addAssistantToken(token);
        syncChatToContext();
        textForEndCheck = currentAssistantContent;
    } else {
        // Context mode: original behavior
        contextInput.value += token;
        lastSelectedToken = token;  // Track this as the last selected token
        // Scroll textarea to bottom
        contextInput.scrollTop = contextInput.scrollHeight;
        textForEndCheck = contextInput.value;
    }

    // Update syntax highlighting if enabled
    updateSyntaxHighlight();

    // Check for end token - stop auto-inference if found
    // Strip trailing whitespace first (models often add newlines after end tokens)
    const textForEndCheckStripped = textForEndCheck.trimEnd();
    const endTokenPatterns = ['<|end_of_text|>', '<|im_end|>', '<|eot|>', '</s>', '<end>', '<|END|>'];
    for (const pattern of endTokenPatterns) {
        if (textForEndCheckStripped.endsWith(pattern)) {
            if (autoInferRunning) {
                stopAutoInfer();
            }
            if (currentMode === 'chat' && isGeneratingResponse) {
                finishAssistantMessage();
            }
            isSelectingToken = false;
            return;
        }
    }

    // Trigger fetch and wait for it to complete
    await fetchCandidates();

    // Only clear flag after fetch completes
    isSelectingToken = false;
    console.log('[AutoInfer] isSelectingToken cleared');
}

function repr(s) {
    return JSON.stringify(s);
}

function escapeHtml(text) {
    // Basic escaping and visualizing spaces
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "␤") // Visualize newlines
        .replace(/ /g, "·"); // Visualize spaces
}

function escapeHtmlPreserveWhitespace(text) {
    // Basic escaping without visualizing spaces/newlines (for syntax highlighting)
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function highlightChatML(text) {
    let result = escapeHtmlPreserveWhitespace(text);

    // Highlight <|im_start|>role and <|im_end|> tokens
    result = result.replace(/(&lt;\|im_start\|&gt;)(\w+)?/g, (match, startToken, role) => {
        if (role) {
            const roleClass = role === 'system' ? 'hl-role-system' :
                             role === 'user' ? 'hl-role-user' :
                             role === 'assistant' ? 'hl-role-assistant' : 'hl-content-text';
            return `<span class="hl-token-start">${startToken}</span><span class="${roleClass}">${role}</span>`;
        }
        return `<span class="hl-token-start">${startToken}</span>`;
    });

    result = result.replace(/&lt;\|im_end\|&gt;/g, '<span class="hl-token-end">&lt;|im_end|&gt;</span>');

    // Also highlight <|end_of_text|> for consistency
    result = result.replace(/&lt;\|end_of_text\|&gt;/g, '<span class="hl-token-end">&lt;|end_of_text|&gt;</span>');

    return result;
}

function toggleSyntaxHighlighting() {
    syntaxHighlightEnabled = !syntaxHighlightEnabled;
    const contextWindow = document.getElementById('context-window');
    const contextHighlighted = document.getElementById('context-highlighted');

    if (syntaxHighlightEnabled) {
        contextWindow.classList.add('hidden');
        contextHighlighted.classList.remove('hidden');
        updateSyntaxHighlight();
    } else {
        contextWindow.classList.remove('hidden');
        contextHighlighted.classList.add('hidden');
    }
}

function updateSyntaxHighlight() {
    if (!syntaxHighlightEnabled) return;
    const contextWindow = document.getElementById('context-window');
    const contextHighlighted = document.getElementById('context-highlighted');
    contextHighlighted.innerHTML = highlightChatML(contextWindow.value);
    contextHighlighted.scrollTop = contextWindow.scrollTop;
    contextHighlighted.scrollLeft = contextWindow.scrollLeft;
}

// Event Listeners
contextInput.addEventListener('input', () => {
    // Skip if in chat mode (syncChatToContext handles updates)
    if (currentMode === 'chat') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        // Check if we're in beam view (has active class, not hidden)
        const inBeamView = beamView.classList.contains('active');
        if (inBeamView) {
            scheduleBeamGenerate();
        } else {
            fetchCandidates();
        }
    }, 500);

    updateSyntaxHighlight();
});

// Update controls
[tempSlider, topkSlider, toppSlider, penaltySlider].forEach(input => {
    input.addEventListener('input', (e) => {
        e.target.previousElementSibling.querySelector('span').textContent = e.target.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchCandidates, 500);
    });
});

// Initial load
contextInput.value = "Once upon a time, there was a";
fetchCandidates();
startDownloadPolling(); // Check for any existing downloads on load

// Make download indicator clickable to open model modal
const downloadIndicator = document.getElementById('download-indicator');
if (downloadIndicator) {
    downloadIndicator.addEventListener('click', () => {
        toggleModelModal(true);
        // Switch to the download tab
        const remoteTab = document.querySelector('.tab-btn[data-tab="remote"]');
        if (remoteTab) remoteTab.click();
    });
}

// Downloads functionality
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function parseRepoInput(input) {
    input = input.trim();
    // Check if it's a URL
    if (input.startsWith('http')) {
        try {
            const url = new URL(input);
            if (url.hostname === 'huggingface.co') {
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) {
                    return `${parts[0]}/${parts[1]}`;
                }
            }
        } catch (e) {
            // Not a valid URL, treat as repo_id
        }
    }
    return input;
}

async function startDownloadPolling() {
    if (downloadPollInterval) return;

    await updateDownloadsStatus();

    downloadPollInterval = setInterval(async () => {
        const hasActive = await updateDownloadsStatus();
        if (!hasActive) {
            clearInterval(downloadPollInterval);
            downloadPollInterval = null;
        }
    }, 1500);
}

async function updateDownloadsStatus() {
    try {
        const res = await fetch('/downloads/status');
        const data = await res.json();

        downloads = {};
        data.downloads.forEach(d => {
            downloads[d.download_id] = d;
        });

        renderDownloads();
        updateDownloadIndicator(data.active_count);

        return data.active_count > 0;
    } catch (e) {
        console.error('Failed to fetch download status:', e);
        return false;
    }
}

function updateDownloadIndicator(activeCount) {
    const indicator = document.getElementById('download-indicator');
    const countSpan = document.getElementById('download-count');

    if (activeCount > 0) {
        indicator.classList.remove('hidden');
        indicator.classList.add('active');
        countSpan.textContent = activeCount;
    } else {
        indicator.classList.remove('active');
        // Keep showing if there are recent completed downloads
        const hasRecentCompleted = Object.values(downloads).some(
            d => d.state === 'completed' && !d.notified
        );
        if (!hasRecentCompleted) {
            indicator.classList.add('hidden');
        } else {
            countSpan.textContent = '✓';
        }
    }
}

function renderDownloads() {
    const downloadsList = document.getElementById('downloads-list');
    if (!downloadsList) return;

    // Sort by state (in_progress first), then by time
    const sortedDownloads = Object.values(downloads).sort((a, b) => {
        const stateOrder = { in_progress: 0, pending: 1, completed: 2, failed: 3, cancelled: 4 };
        return stateOrder[a.state] - stateOrder[b.state] ||
              new Date(b.started_at) - new Date(a.started_at);
    });

    downloadsList.innerHTML = '';

    for (const download of sortedDownloads) {
        const li = document.createElement('li');
        li.className = 'download-item';

        const stateClass = download.state;
        const stateLabel = download.state.replace('_', ' ');

        let progressHtml = '';
        if (download.state === 'in_progress' || download.state === 'pending') {
            const pct = download.progress || 0;
            progressHtml = `
                <div class="download-progress-bar">
                    <div class="download-progress-fill" style="width: ${pct}%"></div>
                </div>
            `;
        }

        let actionsHtml = '';
        if (download.state === 'in_progress' || download.state === 'pending') {
            actionsHtml = `
                <div class="download-item-actions">
                    <button class="download-cancel-btn" onclick="cancelDownload('${download.download_id}')">Cancel</button>
                </div>
            `;
        }

        let infoHtml = '';
        if (download.total_bytes > 0) {
            infoHtml = `
                <div class="download-item-info">
                    <span>${formatBytes(download.bytes_downloaded)} / ${formatBytes(download.total_bytes)}</span>
                    <span>${download.progress.toFixed(1)}%</span>
                </div>
            `;
        } else if (download.state === 'failed') {
            infoHtml = `
                <div class="download-item-info">
                    <span style="color: #f44336;">${download.error_message || 'Download failed'}</span>
                </div>
            `;
        } else if (download.state === 'completed') {
            infoHtml = `
                <div class="download-item-info">
                    <span style="color: #4caf50;">Complete - ${formatBytes(download.bytes_downloaded)}</span>
                </div>
            `;
        }

        li.innerHTML = `
            <div class="download-item-header">
                <span class="download-item-filename" title="${download.filename}">${download.filename}</span>
                <span class="download-item-status ${stateClass}">${stateLabel}</span>
            </div>
            ${progressHtml}
            ${infoHtml}
            ${actionsHtml}
        `;

        downloadsList.appendChild(li);

        // Notify on complete
        if (download.state === 'completed' && !download.notified) {
            download.notified = true;
            showNotification(`Download complete: ${download.filename}`);
            // Refresh local models
            loadLocalModels();
        }
    }
}

function showNotification(message) {
    // Simple notification using a temporary element
    const existing = document.getElementById('notification-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'notification-toast';
    toast.className = 'notification-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--accent);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Help Panel Logic
const helpOverlay = document.getElementById('help-overlay');
const helpPanel = document.getElementById('help-panel');
const openHelpBtn = document.getElementById('open-help');
const closeHelpBtn = document.getElementById('close-help');

function toggleHelp(show) {
    if (show) {
        helpOverlay.classList.remove('hidden');
        helpPanel.classList.remove('hidden');
    } else {
        helpOverlay.classList.add('hidden');
        helpPanel.classList.add('hidden');
    }
}

// Check if elements exist (in case of partial load or caching issues)
if (openHelpBtn && closeHelpBtn && helpOverlay && helpPanel) {
    openHelpBtn.addEventListener('click', () => toggleHelp(true));
    closeHelpBtn.addEventListener('click', () => toggleHelp(false));
    helpOverlay.addEventListener('click', () => toggleHelp(false));
}

// Model Manager Logic
const modelModal = document.getElementById('model-modal');
const modelSelectorBtn = document.getElementById('model-selector');
const closeModelModalBtn = document.getElementById('close-model-modal');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const localModelList = document.getElementById('local-model-list');
const remoteFileList = document.getElementById('remote-file-list');
const repoInput = document.getElementById('repo-input');
const scanBtn = document.getElementById('scan-btn');

// Toggle Modal
function toggleModelModal(show) {
    if (show) {
        modelModal.classList.remove('hidden');
        loadLocalModels();
        updateDownloadsStatus(); // Load current download status
    } else {
        modelModal.classList.add('hidden');
    }
}

// Initialize model selector button with current model's friendly name
async function initModelSelector() {
    try {
        const res = await fetch('/models');
        const models = await res.json();
        // Get the currently loaded model from LLM engine
        const currentRes = await fetch('/models/current');
        if (currentRes.ok) {
            const currentData = await currentRes.json();
            if (currentData.model) {
                const currentModel = models.find(m => m.filename === currentData.model);
                const displayName = currentModel?.friendly_name || currentData.model;
                modelSelectorBtn.textContent = displayName + " ▾";
                return;
            }
        }
        // Fallback: use first model or default text
        if (models.length > 0) {
            const displayName = models[0].friendly_name || models[0].filename;
            modelSelectorBtn.textContent = displayName + " ▾";
        }
    } catch (e) {
        // Keep default text from HTML
    }
}

if (modelSelectorBtn) {
    modelSelectorBtn.addEventListener('click', () => toggleModelModal(true));
    closeModelModalBtn.addEventListener('click', () => toggleModelModal(false));
    // Initialize on page load
    initModelSelector();
}

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => { b.classList.remove('active'); });
        tabContents.forEach(c => { c.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

// API Calls
async function loadLocalModels() {
    localModelList.innerHTML = '<li>Loading...</li>';
    try {
        const res = await fetch('/models');
        const models = await res.json();
        localModelList.innerHTML = '';
        models.forEach(m => {
            const li = document.createElement('li');
            // Use friendly_name if available, otherwise fall back to filename
            const displayName = m.friendly_name || m.filename;
            const showFilename = m.friendly_name && m.friendly_name !== m.filename;
            li.innerHTML = `
                <div class="model-info">
                    <strong>${escapeHtml(displayName)}</strong>
                    ${showFilename ? `<small class="model-filename">${escapeHtml(m.filename)}</small>` : ''}
                    <small>${m.size_mb} MB</small>
                </div>
                <button class="action-btn" onclick="switchModel('${m.filename}')">Load</button>
            `;
            localModelList.appendChild(li);
        });
    } catch (e) {
        localModelList.innerHTML = `<li>Error: ${e}</li>`;
    }
}

async function switchModel(filename) {
    modelSelectorBtn.textContent = "Loading...";
    modelSelectorBtn.disabled = true;
    toggleModelModal(false);

    // Disable and show loading state in candidates section
    candidatesList.classList.add('loading');
    candidatesList.innerHTML = '<li class="loading-message">Loading model...</li>';

    // Disable context input and controls
    const controlsToDisable = [
        contextInput,
        tempSlider,
        topkSlider,
        toppSlider,
        penaltySlider,
        autoInferBtn,
    ];
    controlsToDisable.forEach(el => {
        if (el) {
            el.disabled = true;
            el.classList.add('disabled');
        }
    });

    try {
        const res = await fetch('/models/switch', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filename})
        });
        if (!res.ok) throw new Error("Failed to switch");
        const data = await res.json();

        // Use friendly_name if available, otherwise filename
        const displayName = data.friendly_name || data.model || filename;
        modelSelectorBtn.textContent = displayName + " ▾";

        // Refresh models list to get updated metadata
        await loadLocalModels();

        // Refresh candidates with the newly loaded model
        await fetchCandidates();
    } catch (e) {
        alert("Error switching model: " + e);
        modelSelectorBtn.textContent = "Error ▾";
        candidatesList.innerHTML = '<li class="error-message">Failed to load model</li>';
    } finally {
        candidatesList.classList.remove('loading');
        // Re-enable controls
        modelSelectorBtn.disabled = false;
        controlsToDisable.forEach(el => {
            if (el) {
                el.disabled = false;
                el.classList.remove('disabled');
            }
        });
    }
}

// Scan Remote
if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
        const input = repoInput.value.trim();
        if (!input) return;

        const repo = parseRepoInput(input);

        remoteFileList.innerHTML = '<li>Scanning...</li>';
        try {
            const res = await fetch(`/models/lookup?repo_id=${encodeURIComponent(repo)}`);
            const files = await res.json();

            if (files.error) throw new Error(files.error);

            remoteFileList.innerHTML = '';
            if (files.length === 0) {
                remoteFileList.innerHTML = '<li>No GGUF files found.</li>';
                return;
            }

            files.forEach(f => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="model-info">
                        <strong>${f.filename}</strong>
                        <small>${f.size_mb} MB</small>
                    </div>
                    <button class="action-btn" onclick="downloadModel('${repo}', '${f.filename}')">Download</button>
                `;
                remoteFileList.appendChild(li);
            });
        } catch (e) {
            remoteFileList.innerHTML = `<li>Error: ${e.message}</li>`;
        }
    });
}

// Download
window.downloadModel = async (repo, filename) => {
    try {
        const res = await fetch('/models/download', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({repo_id: repo, filename})
        });
        const data = await res.json();

        if (data.download_id) {
            // Download started in background
            startDownloadPolling();
        }
    } catch (e) {
        console.error('Failed to start download:', e);
        showNotification('Failed to start download');
    }
};

// Cancel download
window.cancelDownload = async (downloadId) => {
    try {
        const res = await fetch(`/downloads/${downloadId}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            showNotification('Download cancelled');
        }
    } catch (e) {
        console.error('Failed to cancel download:', e);
    }
};

// Make switchModel global
window.switchModel = switchModel;

// Chat mode functions
const SYSTEM_PRESETS = {
    standard: 'SYSTEM INSTRUCTION: You are a helpful, accurate assistant that responds clearly and concisely. End your response with:<|end_of_text|>',
    rhyme: 'SYSTEM INSTRUCTION: You are a helpful assistant that always responds in rhyme. End your response with:<|end_of_text|>',
    creative: 'SYSTEM INSTRUCTION: You are a creative writing partner. You help with stories, poetry, and creative projects. Be imaginative and descriptive. End your response with:<|end_of_text|>',
    code: 'SYSTEM INSTRUCTION: You are a coding assistant. You help with programming questions, write code, and debug issues. Provide clear explanations and code examples. End your response with:<|end_of_text|>',
    concise: 'SYSTEM INSTRUCTION: You are a concise assistant. You respond with brief, to-the-point answers. End your response with:<|end_of_text|>',
    educator: 'SYSTEM INSTRUCTION: You are an educator. You explain concepts clearly, use examples, and check for understanding. End your response with:<|end_of_text|>'
};

function syncChatToContext() {
    // Build full context from chat messages
    const systemPrompt = systemPromptInput.value.trim();
    let fullContext = systemPrompt;

    chatMessages.forEach(msg => {
        if (msg.role === 'user') {
            fullContext += '\n\nUSER: ' + msg.content;
        } else {
            fullContext += '\n\nASSISTANT: ' + msg.content;
        }
    });

    // If assistant is currently generating, add their label and partial content
    if (isGeneratingResponse) {
        fullContext += '\n\nASSISTANT:' + currentAssistantContent;
    }

    contextInput.value = fullContext;
    updateSyntaxHighlight();
}

function syncContextToChat() {
    const text = contextInput.value.trim();
    if (!text) {
        chatMessages = [];
        return;
    }

    // Parse system instruction
    const systemMatch = text.match(/(SYSTEM INSTRUCTION:.*?)(?=\n\nUSER:|$)/s);
    if (systemMatch) {
        systemPromptInput.value = systemMatch[1].trim();
    }

    // Parse messages (simple alternating pattern)
    chatMessages = [];
    const lines = text.split('\n\n');

    for (const line of lines) {
        if (line.startsWith('USER:')) {
            chatMessages.push({
                role: 'user',
                content: line.slice(5).trim()
            });
        } else if (line.startsWith('ASSISTANT:')) {
            chatMessages.push({
                role: 'assistant',
                content: line.slice(10).trim()
            });
        }
    }
}

function renderChatMessages() {
    chatMessagesContainer.innerHTML = '';

    if (chatMessages.length === 0 && !isGeneratingResponse) {
        chatMessagesContainer.innerHTML = '<div class="chat-empty-state">Start a conversation...</div>';
        return;
    }

    chatMessages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${msg.role}`;
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.textContent = msg.content;  // textContent handles escaping and preserves newlines
        msgDiv.innerHTML = `<div class="role-label">${msg.role}</div>`;
        msgDiv.appendChild(contentDiv);
        chatMessagesContainer.appendChild(msgDiv);
    });

    // Add generating assistant message if active
    if (isGeneratingResponse) {
        // Strip leading whitespace for display only (keep in context for LLM)
        const displayContent = currentAssistantContent.replace(/^[\n\s]+/, '');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message assistant generating';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.textContent = displayContent;
        msgDiv.innerHTML = `<div class="role-label">assistant</div>`;
        msgDiv.appendChild(contentDiv);
        chatMessagesContainer.appendChild(msgDiv);
    }

    // Scroll to bottom
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function addUserMessage(content) {
    chatMessages.push({ role: 'user', content });
    currentAssistantContent = '';
    renderChatMessages();
}

function addAssistantToken(token) {
    currentAssistantContent += token;
    renderChatMessages();
}

function finishAssistantMessage() {
    if (currentAssistantContent) {
        // Strip end token patterns from the content (chat mode only)
        let cleanedContent = currentAssistantContent;
        const endTokenPatterns = ['<|end_of_text|>', '<|im_end|>', '<|eot|>', '</s>', '<end>', '<|END|>'];
        for (const pattern of endTokenPatterns) {
            cleanedContent = cleanedContent.replace(pattern, '');
        }
        // Strip leading whitespace for saved message (display only)
        cleanedContent = cleanedContent.replace(/^[\n\s]+/, '');
        chatMessages.push({ role: 'assistant', content: cleanedContent });
    }
    currentAssistantContent = '';
    isGeneratingResponse = false;
    renderChatMessages();
    // Clear candidates - we're now waiting for user input
    candidatesList.innerHTML = '<div class="chat-empty-state">Send a message to see predictions</div>';
    currentCandidates = [];
    chatUserInput.disabled = false;
    chatSendBtn.disabled = false;
    chatUserInput.focus();
}

// System preset handler
if (systemPresetSelect) {
    systemPresetSelect.addEventListener('change', (e) => {
        const preset = e.target.value;
        systemPromptInput.value = SYSTEM_PRESETS[preset];
        syncChatToContext();
    });
}

// Chat send handler
if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
}

if (chatUserInput) {
    chatUserInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

async function sendChatMessage() {
    const content = chatUserInput.value.trim();
    if (!content || isGeneratingResponse) return;

    // Add user message
    addUserMessage(content);
    chatUserInput.value = '';

    // Prepare for assistant response
    isGeneratingResponse = true;
    currentAssistantContent = '';
    isFirstAssistantToken = true;  // Reset flag for new response
    chatUserInput.disabled = true;
    chatSendBtn.disabled = true;

    // Sync to context and fetch candidates
    syncChatToContext();
    await fetchCandidates();

    // Start auto-inference
    startAutoInfer();
}

// Beam Search functionality
const viewToggles = document.querySelectorAll('.view-toggle');
const candidatesView = document.getElementById('candidates-view');
const beamView = document.getElementById('beam-view');
const beamPathsSlider = document.getElementById('beam-paths-slider');
const beamDepthSlider = document.getElementById('beam-depth-slider');
const beamPathsVal = document.getElementById('beam-paths-val');
const beamDepthVal = document.getElementById('beam-depth-val');
const beamPathsGrid = document.getElementById('beam-paths-grid');

// Debounce timer for slider changes
let beamSliderDebounce = null;

// View toggle
viewToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        viewToggles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (view === 'candidates') {
            candidatesView.classList.remove('hidden');
            candidatesView.classList.add('active');
            beamView.classList.remove('active');
            beamView.classList.add('hidden');
            autoInferBtn.classList.remove('hidden');
        } else {
            candidatesView.classList.remove('active');
            candidatesView.classList.add('hidden');
            beamView.classList.remove('hidden');
            beamView.classList.add('active');
            autoInferBtn.classList.add('hidden');
            // Stop auto-infer if running
            if (autoInferRunning) {
                stopAutoInfer();
            }
            // Generate paths if context changed or no paths exist
            const currentContext = contextInput.value.trim();
            if (currentContext !== beamLastContext || beamPaths.length === 0) {
                if (!isBeamLoading) {
                    generateBeamPaths();
                }
            }
        }
    });
});

// Beam sliders - auto-generate paths on change with debouncing
if (beamPathsSlider && beamPathsVal) {
    beamPathsSlider.addEventListener('input', (e) => {
        beamPathsVal.textContent = e.target.value;
        scheduleBeamGenerate();
    });
}

if (beamDepthSlider && beamDepthVal) {
    beamDepthSlider.addEventListener('input', (e) => {
        beamDepthVal.textContent = e.target.value;
        scheduleBeamGenerate();
    });
}

function scheduleBeamGenerate() {
    if (beamSliderDebounce) {
        clearTimeout(beamSliderDebounce);
    }
    beamSliderDebounce = setTimeout(() => {
        if (contextInput.value.trim()) {
            generateBeamPaths();
        }
    }, 300);
}

// Track current beam generation request to ignore stale results
let currentBeamRequestId = 0;

async function generateBeamPaths() {
    const context = contextInput.value.trim();
    if (!context) {
        beamPathsGrid.innerHTML = '<div class="beam-empty-state"><p>Enter some context first</p></div>';
        return;
    }

    // Increment request ID and capture it for this request
    const requestId = ++currentBeamRequestId;
    isBeamLoading = true;
    beamPathsGrid.innerHTML = '<div class="beam-loading">Generating paths...</div>';

    try {
        const numPaths = parseInt(beamPathsSlider.value);
        const depth = parseInt(beamDepthSlider.value);

        const res = await fetch('/beam/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                context: context,
                num_paths: numPaths,
                depth: depth
            })
        });

        // Ignore response if a newer request has been initiated
        if (requestId !== currentBeamRequestId) {
            return;
        }

        if (!res.ok) throw new Error('Failed to generate paths');

        const data = await res.json();
        // Deduplicate paths by text (keep first occurrence)
        const seenTexts = new Set();
        beamPaths = data.paths.filter(p => {
            if (seenTexts.has(p.text)) {
                return false;
            }
            seenTexts.add(p.text);
            return true;
        });
        beamLastContext = context;  // Track context used for these paths
        renderBeamPaths();
    } catch (e) {
        // Only show error if this is still the current request
        if (requestId === currentBeamRequestId) {
            console.error(e);
            beamPathsGrid.innerHTML = '<div class="beam-empty-state"><p>Error generating paths</p></div>';
        }
    } finally {
        // Only clear loading state if this is still the current request
        if (requestId === currentBeamRequestId) {
            isBeamLoading = false;
        }
    }
}

function renderBeamPaths() {
    if (!beamPaths || beamPaths.length === 0) {
        beamPathsGrid.innerHTML = '<div class="beam-empty-state"><p>No paths generated</p></div>';
        return;
    }

    beamPathsGrid.innerHTML = '';

    beamPaths.forEach((path, index) => {
        const card = document.createElement('div');
        card.className = 'beam-path-card';
        card.dataset.pathId = path.id;

        // Format cumulative probability as percentage
        const probPct = (path.cumulative_prob * 100).toFixed(2);

        // Build tokens display
        const tokensHtml = path.tokens.map(t =>
            `<span class="beam-token">${escapeHtml(t.token)} <span class="beam-token-prob">${(t.prob * 100).toFixed(1)}%</span></span>`
        ).join('');

        card.innerHTML = `
            <div class="beam-path-header">
                <span class="beam-path-title">Path ${index + 1}</span>
                <span class="beam-path-prob">${probPct}%</span>
            </div>
            <div class="beam-path-text">${escapeHtml(path.text.slice(contextInput.value.length))}</div>
            <div class="beam-path-tokens">${tokensHtml}</div>
            <div class="beam-path-actions">
                <button class="beam-action-btn extend" onclick="extendBeamPath('${path.id}')">Extend</button>
                <button class="beam-action-btn adopt" onclick="adoptBeamPath('${path.id}')">Adopt</button>
            </div>
        `;

        beamPathsGrid.appendChild(card);
    });
}

async function extendBeamPath(pathId) {
    const path = beamPaths.find(p => p.id === pathId);
    if (!path) return;

    const card = beamPathsGrid.querySelector(`[data-path-id="${pathId}"]`);
    if (card) {
        const extendBtn = card.querySelector('.extend');
        if (extendBtn) {
            extendBtn.disabled = true;
            extendBtn.textContent = 'Extending...';
        }
    }

    try {
        const res = await fetch('/beam/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                context: path.text,
                num_paths: 1,
                depth: 1
            })
        });

        if (!res.ok) throw new Error('Failed to extend path');

        const data = await res.json();
        if (data.paths && data.paths.length > 0) {
            const newPath = data.paths[0];

            // Update the path
            path.text = newPath.text;
            path.tokens = [...path.tokens, ...newPath.tokens];
            path.cumulative_prob *= newPath.cumulative_prob;

            renderBeamPaths();
        }
    } catch (e) {
        console.error(e);
        if (card) {
            const extendBtn = card.querySelector('.extend');
            if (extendBtn) {
                extendBtn.disabled = false;
                extendBtn.textContent = 'Extend';
            }
        }
    }
}

function adoptBeamPath(pathId) {
    const path = beamPaths.find(p => p.id === pathId);
    if (!path) return;

    // Set the context to the path's text
    contextInput.value = path.text;
    updateSyntaxHighlight();
    fetchCandidates();

    // Clear the beam paths and tracked context so new paths will generate
    beamPaths = [];
    beamLastContext = '';

    // Generate new paths from the updated context
    generateBeamPaths();
}

function deleteBeamPath(pathId) {
    beamPaths = beamPaths.filter(p => p.id !== pathId);
    renderBeamPaths();
}

// Make beam functions global
window.extendBeamPath = extendBeamPath;
window.adoptBeamPath = adoptBeamPath;
window.deleteBeamPath = deleteBeamPath;