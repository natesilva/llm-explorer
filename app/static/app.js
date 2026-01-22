const contextInput = document.getElementById('context-window');
const candidatesList = document.getElementById('candidates-list');
const tempSlider = document.getElementById('temp-slider');
const topkSlider = document.getElementById('topk-slider');

// State
let debounceTimer;

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
                top_k: parseInt(topkSlider.value)
            })
        });
        
        if (!response.ok) throw new Error("API Error");
        
        const data = await response.json();
        renderCandidates(data.candidates);
    } catch (e) {
        console.error(e);
    }
}

function renderCandidates(candidates) {
    candidatesList.innerHTML = '';
    
    candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = 'candidate-item';
        div.onclick = () => selectToken(c.token);
        
        div.innerHTML = `
            <span class="token-text">${escapeHtml(c.token)}</span>
            <div class="prob-bar-container">
                <div class="prob-bar" style="width: ${c.prob}%"></div>
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
        .replace(/ /g, "·"); // Visualize spaces
}

// Event Listeners
contextInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchCandidates, 500);
});

// Update controls
[tempSlider, topkSlider].forEach(input => {
    input.addEventListener('input', (e) => {
        e.target.previousElementSibling.querySelector('span').textContent = e.target.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchCandidates, 500);
    });
});

// Initial load
contextInput.value = "Once upon a time, there was a";
fetchCandidates();
