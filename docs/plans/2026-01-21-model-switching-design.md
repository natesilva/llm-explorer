# Model Switching Design Document

## 1. Overview
Allow users to switch between different GGUF models at runtime and download new ones from HuggingFace.

## 2. Architecture

### Backend (`app/models.py`)
- **Discovery**: Scan `app/models/*.gguf`.
- **HuggingFace**: Wrapper around `huggingface_hub` to list files and download.
- **Async Download**: Downloads run in a background thread/task to avoid blocking the main server. Progress is tracked in a global `download_status` dict.

### Engine (`app/llm.py`)
- **Switching**: Add `load_model(model_path)` method.
- **Safety**: Ensure `lock` is held during switch. Unload old model properly (Python GC + llama-cpp-python destructor usually handles this, but explicit cleanup is safer).

### API (`app/main.py`)
- `GET /models/local`: List downloaded models.
- `GET /models/remote/{repo_id}`: List GGUF files in HF repo.
- `POST /models/download`: Start download `{repo_id, filename}`.
- `GET /models/download/status`: Poll progress.
- `POST /models/load`: Switch active model `{filename}`.

### Frontend (`app/static/`)
- **Model Manager Modal**:
  - List local models -> Click to Load.
  - Add New -> Search HF -> Select File -> Download.
  - Progress bar for downloads.
  - "Loading..." overlay during model switch.

## 3. Implementation Plan
1.  **Worktree**: `feature/model-switching`
2.  **Backend - Models**: Implement discovery and HF interaction.
3.  **Backend - Engine**: Implement switching logic.
4.  **API**: Add endpoints.
5.  **Frontend**: Build the Modal UI and logic.
