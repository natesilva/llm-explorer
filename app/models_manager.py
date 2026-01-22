import os
import glob

# Constants
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")


class ModelManager:
    def list_local_models(self):
        models = []
        if not os.path.exists(MODEL_DIR):
            return []

        for file_path in glob.glob(os.path.join(MODEL_DIR, "*.gguf")):
            size_bytes = os.path.getsize(file_path)
            models.append(
                {
                    "filename": os.path.basename(file_path),
                    "size_mb": round(size_bytes / (1024 * 1024), 2),
                    "path": file_path,
                }
            )
        return sorted(models, key=lambda x: x["filename"])
