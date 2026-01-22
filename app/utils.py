import os
from huggingface_hub import hf_hub_download

MODEL_REPO = "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
MODEL_FILE = "Meta-Llama-3.1-8B-Instruct-Q8_0.gguf"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")


def get_model_path() -> str:
    # Ensure model dir exists
    os.makedirs(MODEL_DIR, exist_ok=True)

    local_path = os.path.join(MODEL_DIR, MODEL_FILE)

    if os.path.exists(local_path):
        return local_path

    print(f"Downloading {MODEL_FILE}...")
    path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE, local_dir=MODEL_DIR)
    return path
