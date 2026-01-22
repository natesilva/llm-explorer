# LLM Explorer Design Document

## 1. Overview
A local, web-based application to visualize Large Language Model (LLM) token generation. Users can interactively select the next token from a list of probabilities, providing an educational view into how LLMs "think".

## 2. Architecture

### Backend
- **Framework**: FastAPI (Python)
- **Model Engine**: `llama-cpp-python` binding for `llama.cpp`
- **Model Source**: Meta Llama 3.1 8B Instruct (GGUF format)
  - **Quantization**: Q8_0 (~8.5GB) for high quality on 21GB RAM
  - **Auto-download**: App checks `app/models/` and downloads from HuggingFace if missing.
- **Hardware Acceleration**: Metal (macOS) enabled via `n_gpu_layers=-1`.

### Frontend
- **Technology**: Custom HTML/CSS/JavaScript served by FastAPI.
- **Style**: Dark mode, modern "IDE-like" aesthetic.
- **Interactivity**: 
  - Real-time token clicking.
  - Immediate updates of context and probabilities.

## 3. Key Features
1.  **Context Window**: Displays the current text.
2.  **Next Token Explorer**: Shows top K (e.g., 5-10) next tokens with probability bars and percentages.
3.  **Controls**:
    - **Temperature**: Slider (0.0 - 2.0)
    - **Top-K**: Slider (1 - 100)
    - **Top-P**: Slider (0.0 - 1.0)
4.  **Auto-Setup**: Handles model downloading automatically.

## 4. Implementation Plan
1.  **Project Structure**: Setup `app/`, `requirements.txt`.
2.  **Model Management**: Script to download Q8_0 GGUF.
3.  **Backend Logic**: `llm.py` wrapper for stateful inference.
4.  **API**: Endpoints for `/info`, `/next-tokens`.
5.  **Frontend**: HTML/JS implementation.
6.  **Refinement**: Styling and polish.
