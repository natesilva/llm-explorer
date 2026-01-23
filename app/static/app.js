const contextInput = document.getElementById('context-window');
const candidatesList = document.getElementById('candidates-list');
const tempSlider = document.getElementById('temp-slider');
const topkSlider = document.getElementById('topk-slider');
const toppSlider = document.getElementById('topp-slider');
const penaltySlider = document.getElementById('penalty-slider');
const themeToggleBtn = document.getElementById('theme-toggle');

// State
let debounceTimer;

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

async function fetchCandidates() {
    const text = contextInput.value;
    if (!text) return;

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
        
        if (!response.ok) throw new Error("API Error");
        
        const data = await response.json();
        renderCandidates(data.candidates);
    } catch (e) {
        console.error(e);
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
        candidatesList.appendChild(div);
    });
}

function selectToken(token) {
    contextInput.value += token;
    // Trigger update immediately
    fetchCandidates();
    // Scroll textarea to bottom
    contextInput.scrollTop = contextInput.scrollHeight;
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

// Event Listeners
contextInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchCandidates, 500);
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
const dlStatus = document.getElementById('dl-status');
const dlProgress = document.getElementById('download-progress');

// Toggle Modal
function toggleModelModal(show) {
    if (show) {
        modelModal.classList.remove('hidden');
        loadLocalModels();
    } else {
        modelModal.classList.add('hidden');
    }
}

if (modelSelectorBtn) {
    modelSelectorBtn.addEventListener('click', () => toggleModelModal(true));
    closeModelModalBtn.addEventListener('click', () => toggleModelModal(false));
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
            li.innerHTML = `
                <div class="model-info">
                    <strong>${m.filename}</strong>
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
    toggleModelModal(false);
    try {
        const res = await fetch('/models/switch', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filename})
        });
        if (!res.ok) throw new Error("Failed to switch");
        const data = await res.json();
        modelSelectorBtn.textContent = data.model + " ▾";
        alert("Model switched successfully!");
    } catch (e) {
        alert("Error switching model: " + e);
        modelSelectorBtn.textContent = "Error ▾";
    }
}

// Scan Remote
if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
        const repo = repoInput.value.trim();
        if (!repo) return;
        
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
    if (!confirm(`Download ${filename}? This may take a while.`)) return;
    
    dlProgress.classList.remove('hidden');
    dlStatus.textContent = "Starting...";
    
    try {
        const res = await fetch('/models/download', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({repo_id: repo, filename})
        });
        const data = await res.json();
        if (data.status === 'success') {
            dlStatus.textContent = "Done!";
            alert("Download complete!");
            loadLocalModels(); // Refresh list
        } else {
            throw new Error("Download failed");
        }
    } catch (e) {
        dlStatus.textContent = "Error: " + e;
    }
};

// Make switchModel global
window.switchModel = switchModel;