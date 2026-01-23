# LLM Explorer

Interactive UI for exploring next-token probabilities from local GGUF models via `llama-cpp-python`. Visualize candidate tokens, their probabilities, and sampling controls.

**Inspiration:** https://www.youtube.com/watch?v=vrO8tZ0hHGk  
Vibe-coded using OpenCode, Gemini 3 Pro, and MiniMax M2.1.

## Features

- Next-token probability explorer with color-coded confidence
- Starter texts dropdown + clear button
- Auto-inference mode (weighted random selection with visual feedback)
- Sampling controls: temperature, top-k, top-p, repetition penalty
- Model manager for local GGUF files
- Remote model browser and downloader (Hugging Face Hub)

## Requirements

- Python 3.10+
- macOS with Metal GPU offload supported
- Disk space for GGUF models

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload
```

Open: http://127.0.0.1:8000

Default model downloads automatically on first run.

## API

- `GET /health` — Health check
- `POST /next-tokens` — Get next token candidates
- `GET /models` — List local models
- `GET /models/lookup?repo_id=...` — Search Hugging Face
- `POST /models/download` — Download model
- `POST /models/switch` — Switch model

## Structure

- `app/main.py` — FastAPI app
- `app/llm.py` — LLM engine
- `app/models_manager.py` — Model handling
- `app/static/` — UI (HTML/CSS/JS)

MIT License.
