import os
import glob
from huggingface_hub import HfApi, hf_hub_download

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

    def list_remote_files(self, repo_id: str):
        api = HfApi()
        try:
            files = api.list_repo_tree(repo_id=repo_id, recursive=True)
            gguf_files = []
            for f in files:
                if f.rfilename.endswith(".gguf"):
                    gguf_files.append(
                        {
                            "filename": f.rfilename,
                            "size_mb": round(f.size / (1024 * 1024), 2)
                            if f.size
                            else 0,
                        }
                    )
            return gguf_files
        except Exception as e:
            return {"error": str(e)}

    def download_model(self, repo_id: str, filename: str):
        return hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=MODEL_DIR,
            local_dir_use_symlinks=False,
        )
