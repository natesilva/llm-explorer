# LLM Explorer

An interactive UI for exploring next-token probabilities from local GGUF models via `llama-cpp-python`. This project includes a FastAPI backend and a static frontend that visualizes candidate tokens, their probabilities, and sampling controls.

**Inspiration:** https://www.youtube.com/watch?v=vrO8tZ0hHGk  
Vibe-coded using OpenCode and Gemini 3 Pro.

## Features

- Interactive next-token probability explorer
- Adjustable sampling controls (temperature, top-k, top-p, repetition penalty)
- Model manager for local GGUF files
- Remote model browser and downloader (Hugging Face Hub)
- Local model switching without restarting the UI

## Requirements

- Python 3.10+ recommended
- macOS with Metal is supported (full GPU offload via `n_gpu_layers=-1`)
- Disk space for GGUF models

## Setup

1. Create and activate a virtual environment:
   - macOS/Linux:
     ```/dev/null/venv.sh#L1-3
     python -m venv .venv
     source .venv/bin/activate
     ```
   - Windows (PowerShell):
     ```/dev/null/venv.ps1#L1-2
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```

2. Install dependencies:
   ```/dev/null/install.sh#L1-1
   pip install -r requirements.txt
   ```

## Run the App

Start the FastAPI server:

```/dev/null/run.sh#L1-1
uvicorn app.main:app --reload
```

Open your browser at: `http://127.0.0.1:8000`


On first run, the default model will download automatically (see `app/utils.py`).

## Default Model

The app downloads a default GGUF model if not present:

- Repo: `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`
- File: `Meta-Llama-3.1-8B-Instruct-Q8_0.gguf`

You can change this behavior by editing:

- `app/utils.py` (`MODEL_REPO`, `MODEL_FILE`)

## API Overview

Base URL: `http://127.0.0.1:8000`

### Health Check

`GET /health`

Returns:

```/dev/null/health.json#L1-3
{
  "status": "ok"
}
```

### Next Tokens

`POST /next-tokens`

Request body:

```/dev/null/next_tokens_request.json#L1-6
{
  "text": "Once upon a time, there was a",
  "temp": 0.8,
  "top_k": 40,
  "top_p": 0.95,
  "repeat_penalty": 1.0
}
```

Response:

```/dev/null/next_tokens_response.json#L1-8
{
  "candidates": [
    {
      "token": " ...",
      "prob": 12.3,
      "logprob": -2.1,
      "cumulative_prob": 12.3,
      "excluded": false
    }
  ]
}
```

### List Local Models

`GET /models`

Returns a list of local `.gguf` files:

```/dev/null/models.json#L1-8
[
  {
    "filename": "model.gguf",
    "size_mb": 1234.56,
    "path": "app/models/model.gguf"
  }
]
```

### Lookup Remote Models

`GET /models/lookup?repo_id=...`

Returns GGUF files from a Hugging Face repo:

```/dev/null/lookup.json#L1-6
[
  {
    "filename": "model.gguf",
    "size_mb": 1234.56
  }
]
```

### Download Model

`POST /models/download`

Request:

```/dev/null/download_request.json#L1-4
{
  "repo_id": "bartowski/Llama-3.2-1B-Instruct-GGUF",
  "filename": "some-model.gguf"
}
```

Response:

```/dev/null/download_response.json#L1-4
{
  "status": "success",
  "path": "app/models/some-model.gguf"
}
```

### Switch Model

`POST /models/switch`

Request:

```/dev/null/switch_request.json#L1-3
{
  "filename": "some-model.gguf"
}
```

Response:

```/dev/null/switch_response.json#L1-4
{
  "status": "success",
  "model": "some-model.gguf"
}
```

## Notes

- The repetition penalty implementation is a simple string-based approximation.
- Token probabilities are derived from model logprobs and normalized for display.
- Some Hugging Face repos are gated and require authentication.
- For gated repos, set `HUGGINGFACE_HUB_TOKEN` or `HF_TOKEN` in your environment before downloading.
- If you use remote downloads, ensure you have access to the model’s license and terms.

## Project Structure

- `app/main.py` — FastAPI app and API routes
- `app/llm.py` — LLM engine wrapper
- `app/models_manager.py` — Model listing/downloading
- `app/utils.py` — Default model selection/download
- `app/static/` — UI assets (HTML/CSS/JS)

## License

MIT License. See `LICENSE`.