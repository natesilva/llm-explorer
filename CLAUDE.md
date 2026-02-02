# LLM Explorer

Project overview and development guide for Claude instances.

## Project Purpose

An interactive web application for exploring Large Language Model token generation. Shows real-time token probabilities, supports beam search visualization, and includes a chat mode. Educational/experimental project—not production-focused.

## Tech Stack

- **Backend**: FastAPI, Python 3.x
- **LLM Inference**: `llama-cpp-python` with Metal (Apple Silicon GPU acceleration)
- **Frontend**: Vanilla JavaScript, no build step
- **Models**: GGUF format from HuggingFace

## Architecture

```
app/
├── main.py              # FastAPI endpoints
├── llm.py               # LLMEngine singleton, inference logic
├── models_manager.py    # Model listing/downloading from HuggingFace
├── download_manager.py  # Background download tracking
├── schemas.py           # Pydantic models
├── utils.py             # Model path resolution
└── static/
    ├── index.html       # Main UI
    ├── app.js           # Frontend logic
    └── styles.css       # Styles
```

### Core Flow

1. User types in context window → frontend debounces 500ms
2. POST `/next-tokens` → `LLMEngine.get_next_tokens()`
3. llama.cpp generates 1 token with logprobs
4. Post-processing applies temperature/top-p/repetition penalty in Python
5. Frontend renders candidates as clickable tokens

## Key Implementation Details

### Model Loading (llm.py)

- Singleton pattern prevents multiple model instances
- `n_gpu_layers=-1` offloads all layers to Metal (macOS GPU)
- `logits_all=True` is required to get full logprobs for all tokens
- Thread locking serializes inference calls

### Known llama-cpp-python Bug (llm.py:86-117)

Sometimes `top_logprobs` returns empty. There's a retry fallback:
1. Try with `logprobs=top_k`
2. If empty, retry with `logprobs=10`
3. If still empty, generate without logprobs and return a fake candidate

Check server logs for `DEBUG:` messages to see if this is happening.

### Repetition Penalty (llm.py:127-139)

Implemented as an approximation in Python:
- Simple string match of token text against prompt
- Penalizes logprob by multiplying by `repeat_penalty` if found
- Not token-aware (could have false matches)

### Beam Search (llm.py:183-273)

- `generate_beam_paths()` calls `get_next_tokens()` multiple times sequentially
- Could be optimized with batching, but not critical for learning project
- Returns multiple divergent text paths with cumulative probabilities

### Frontend State Management (app.js)

- Debounced inputs (500ms) to avoid excessive API calls
- Auto-inference at ~5 tokens/second
- Guard flags (`isSelectingToken`, `isLoadingCandidates`) prevent concurrent calls
- Chat mode builds full conversation context for each inference

### Chat Mode (app.js:924-1102)

- Maintains `chatMessages` array
- `syncChatToContext()` builds full prompt with system instruction + messages
- Expects `<|end_of_text|>` token to signal assistant response completion
- Strips end tokens from displayed content but keeps in context

## Model Configuration

- Default: `Meta-Llama-3.1-8B-Instruct-Q8_0.gguf` (~8GB)
- Models stored in `app/models/`
- Downloaded from HuggingFace repos via `models_manager.py`

## Performance Expectations

- **Inherent bottleneck**: Each token requires full 8B parameter forward pass
- On Apple Silicon: expect ~5-20 tokens/second depending on chip
- Code is well-optimized; slowness is system-constrained
- No batching currently implemented

## Development Notes

- The `llama-cpp-python` `__del__` bug workaround (llm.py:11-15) patches the model close method
- Frontend uses global functions for `onclick` handlers (e.g., `window.switchModel`)
- No frontend build process—just edit `.js` files and refresh
- FastAPI serves static files from `/static`

## Testing

- `pytest` is included
- Tests should be in `tests/` directory
