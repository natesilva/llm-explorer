# LLM Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or executing-plans) to implement this plan task-by-task.

**Goal:** Build a local web app to interactively visualize Llama 3.1 8B Instruct token generation.

**Architecture:** FastAPI backend using `llama-cpp-python` for inference, serving a custom HTML/JS frontend.

**Tech Stack:** Python 3.11+, FastAPI, llama-cpp-python, HTML5, CSS3, Vanilla JS.

**Work Directory:** `/Users/nate/dev/personal/llm-explorer/.worktrees/feature`

---

### Task 1: Project Skeleton & Dependencies

**Files:**
- Create: `requirements.txt`
- Create: `app/__init__.py`
- Create: `app/main.py` (minimal)
- Create: `tests/__init__.py`
- Create: `tests/test_skeleton.py`

**Step 1: Create requirements.txt**
Content:
```text
fastapi>=0.109.0
uvicorn>=0.27.0
llama-cpp-python>=0.2.23
huggingface-hub>=0.20.0
pytest>=8.0.0
httpx>=0.26.0
jinja2>=3.1.0
```

**Step 2: Create directory structure**
Run: `mkdir -p app/models app/static tests`
Run: `touch app/__init__.py tests/__init__.py`

**Step 3: Create minimal app/main.py**
```python
from fastapi import FastAPI

app = FastAPI(title="LLM Explorer")

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

**Step 4: Create skeleton test**
File: `tests/test_skeleton.py`
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

**Step 5: Run tests**
Run: `pip install -r requirements.txt`
Run: `pytest tests/test_skeleton.py -v`

**Step 6: Commit**
```bash
git add .
git commit -m "feat: setup project skeleton and dependencies"
```

---

### Task 2: Model Downloader Utility

**Files:**
- Create: `app/utils.py`
- Test: `tests/test_utils.py`

**Step 1: Write failing test for model path resolution**
File: `tests/test_utils.py`
```python
import os
from unittest.mock import patch
from app.utils import get_model_path

def test_get_model_path_exists():
    # Mocking existence to avoid actual download in test
    with patch("os.path.exists", return_value=True):
        path = get_model_path()
        assert "Meta-Llama-3.1-8B-Instruct-Q8_0.gguf" in path

def test_get_model_path_download_trigger():
    with patch("os.path.exists", return_value=False), \
         patch("huggingface_hub.hf_hub_download") as mock_dl:
        
        mock_dl.return_value = "/mock/path/model.gguf"
        path = get_model_path()
        
        mock_dl.assert_called_once()
        assert path == "/mock/path/model.gguf"
```

**Step 2: Implement utils.py**
File: `app/utils.py`
```python
import os
from huggingface_hub import hf_hub_download

MODEL_REPO = "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
MODEL_FILE = "Meta-Llama-3.1-8B-Instruct-Q8_0.gguf"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

def get_model_path() -> str:
    # Ensure model dir exists
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    local_path = os.path.join(MODEL_DIR, MODEL_FILE)
    
    # Check if we already have it (simple check, ideal would be checking hash)
    # But hf_hub_download handles caching well too.
    # We'll use hf_hub_download with local_dir to put it exactly where we want
    # or just let HF cache handle it.
    # User requested it in app/models.
    
    if os.path.exists(local_path):
        return local_path
        
    print(f"Downloading {MODEL_FILE}...")
    path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
        local_dir=MODEL_DIR,
        local_dir_use_symlinks=False
    )
    return path
```

**Step 3: Run tests**
Run: `pytest tests/test_utils.py -v`

**Step 4: Commit**
```bash
git add app/utils.py tests/test_utils.py
git commit -m "feat: add model downloader utility"
```

---

### Task 3: LLM Engine Service

**Files:**
- Create: `app/llm.py`
- Test: `tests/test_llm.py`

**Step 1: Write test (Mocked Llama)**
File: `tests/test_llm.py`
```python
from unittest.mock import MagicMock, patch
from app.llm import LLMEngine

@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_engine_initialization(mock_get_path, mock_llama):
    mock_get_path.return_value = "/path/to/model.gguf"
    engine = LLMEngine()
    
    mock_llama.assert_called_once()
    assert engine.model is not None

@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_get_next_tokens(mock_get_path, mock_llama):
    # Setup mock return for create_completion
    mock_instance = MagicMock()
    mock_llama.return_value = mock_instance
    
    # Mock logprobs output
    mock_instance.create_completion.return_value = {
        "choices": [{
            "logprobs": {
                "top_logprobs": [
                    {"token1": -0.1, "token2": -0.5}
                ]
            }
        }]
    }
    
    engine = LLMEngine()
    tokens = engine.get_next_tokens("Hello", temp=0.7, top_k=40)
    
    mock_instance.create_completion.assert_called_with(
        "Hello",
        max_tokens=1,
        temperature=0.7,
        top_k=40,
        logprobs=10, # Request slightly more to filter
        echo=False
    )
    assert len(tokens) > 0
```

**Step 2: Implement LLMEngine**
File: `app/llm.py`
```python
from llama_cpp import Llama
from app.utils import get_model_path
import math

class LLMEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMEngine, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        model_path = get_model_path()
        # n_gpu_layers=-1 for full Metal offload
        self.model = Llama(
            model_path=model_path,
            n_gpu_layers=-1,
            n_ctx=2048, # Reasonable context
            verbose=False
        )

    def get_next_tokens(self, prompt: str, temp: float = 0.8, top_k: int = 40):
        # We generate 1 token but ask for logprobs
        # Note: llama-cpp-python returns logprobs for the *generated* token position
        
        output = self.model.create_completion(
            prompt,
            max_tokens=1,
            temperature=temp,
            top_k=top_k,
            logprobs=top_k, # We want probabilities for top_k candidates
            echo=False
        )
        
        # Parse output
        choice = output["choices"][0]
        # The API structure for logprobs in completion can be tricky.
        # Usually choice['logprobs']['top_logprobs'][0] contains the dict of top tokens
        
        top_logprobs = choice["logprobs"]["top_logprobs"][0]
        
        results = []
        for token_text, logprob in top_logprobs.items():
            prob = math.exp(logprob) * 100
            results.append({
                "token": token_text,
                "prob": prob,
                "logprob": logprob
            })
            
        # Sort by probability descending
        results.sort(key=lambda x: x["prob"], reverse=True)
        return results
```

**Step 3: Run tests**
Run: `pytest tests/test_llm.py -v`

**Step 4: Commit**
```bash
git add app/llm.py tests/test_llm.py
git commit -m "feat: implement LLM engine service"
```

---

### Task 4: API Endpoints

**Files:**
- Modify: `app/main.py`
- Create: `app/schemas.py`
- Test: `tests/test_api.py`

**Step 1: Define Schemas**
File: `app/schemas.py`
```python
from pydantic import BaseModel
from typing import List

class GenerationRequest(BaseModel):
    text: str
    temp: float = 0.8
    top_k: int = 40

class TokenInfo(BaseModel):
    token: str
    prob: float
    logprob: float

class GenerationResponse(BaseModel):
    candidates: List[TokenInfo]
```

**Step 2: Write API Tests**
File: `tests/test_api.py`
```python
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)

@patch("app.main.LLMEngine")
def test_next_tokens_endpoint(mock_engine_cls):
    # Setup mock
    mock_engine = mock_engine_cls.return_value
    mock_engine.get_next_tokens.return_value = [
        {"token": " world", "prob": 99.0, "logprob": -0.1}
    ]
    
    payload = {"text": "Hello", "temp": 0.5, "top_k": 10}
    response = client.post("/next-tokens", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["token"] == " world"
```

**Step 3: Implement Endpoints**
File: `app/main.py`
```python
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.schemas import GenerationRequest, GenerationResponse
from app.llm import LLMEngine
import os

app = FastAPI(title="LLM Explorer")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("app/static/index.html")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/next-tokens", response_model=GenerationResponse)
def get_next_tokens(request: GenerationRequest):
    engine = LLMEngine() # Singleton access
    try:
        candidates = engine.get_next_tokens(
            request.text,
            temp=request.temp,
            top_k=request.top_k
        )
        return {"candidates": candidates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 4: Run tests**
Run: `pytest tests/test_api.py -v`

**Step 5: Commit**
```bash
git add app/main.py app/schemas.py tests/test_api.py
git commit -m "feat: add API endpoints and static file serving"
```

---

### Task 5: Frontend Implementation

**Files:**
- Create: `app/static/index.html`
- Create: `app/static/style.css`
- Create: `app/static/app.js`

**Step 1: HTML Structure**
File: `app/static/index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Explorer</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>LLM Explorer</h1>
            <div id="status">Llama 3.1 8B</div>
        </header>
        
        <main>
            <div class="panel left">
                <h2>Context</h2>
                <textarea id="context-window" placeholder="Type here or select a prompt..."></textarea>
            </div>
            
            <div class="panel right">
                <h2>Next Token Probability</h2>
                <div id="candidates-list">
                    <!-- Items injected here -->
                </div>
            </div>
        </main>
        
        <footer>
            <div class="control-group">
                <label>Temperature: <span id="temp-val">0.8</span></label>
                <input type="range" id="temp-slider" min="0" max="2" step="0.1" value="0.8">
            </div>
            <div class="control-group">
                <label>Top K: <span id="topk-val">40</span></label>
                <input type="range" id="topk-slider" min="1" max="100" value="40">
            </div>
        </footer>
    </div>
    <script src="/static/app.js"></script>
</body>
</html>
```

**Step 2: CSS Styling**
File: `app/static/style.css`
```css
:root {
    --bg-color: #1e1e1e;
    --panel-bg: #252526;
    --text-color: #d4d4d4;
    --accent: #007acc;
    --highlight: #4ec9b0;
}

body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
}

header {
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #333;
}

main {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.panel {
    padding: 1rem;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.left { border-right: 1px solid #333; }

textarea {
    flex: 1;
    background-color: var(--panel-bg);
    color: var(--text-color);
    border: 1px solid #333;
    padding: 1rem;
    font-size: 1.1rem;
    resize: none;
    font-family: monospace;
}

#candidates-list {
    overflow-y: auto;
    flex: 1;
}

.candidate-item {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: #333;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
}

.candidate-item:hover { background: #444; }

.token-text {
    font-family: monospace;
    font-weight: bold;
    color: var(--highlight);
    width: 100px;
    white-space: pre;
}

.prob-bar-container {
    flex: 1;
    height: 8px;
    background: #222;
    margin: 0 1rem;
    border-radius: 4px;
    overflow: hidden;
}

.prob-bar {
    height: 100%;
    background-color: var(--accent);
}

.prob-text {
    font-size: 0.8rem;
    color: #888;
    width: 50px;
    text-align: right;
}

footer {
    padding: 1rem;
    background: #252526;
    border-top: 1px solid #333;
    display: flex;
    gap: 2rem;
}

.control-group {
    display: flex;
    align-items: center;
    gap: 1rem;
}
```

**Step 3: JavaScript Logic**
File: `app/static/app.js`
```javascript
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
        fetchCandidates();
    });
});

// Initial load
contextInput.value = "Once upon a time, there was a";
fetchCandidates();
```

**Step 4: Commit**
```bash
git add app/static/
git commit -m "feat: frontend implementation"
```

---

### Task 6: Final Verification & Run

**Step 1: Manual Verification**
Run: `uvicorn app.main:app --reload`
- Open `http://127.0.0.1:8000`
- Confirm model downloads (first run)
- Confirm inference works
- Confirm clicking tokens updates context

**Step 2: Final Commit**
```bash
git commit --allow-empty -m "chore: implementation complete"
```
