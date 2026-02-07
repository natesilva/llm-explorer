import os
import glob
import time
from urllib.parse import urlparse
from huggingface_hub import HfApi, hf_hub_download

from app.download_manager import DownloadManager, DownloadState

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")


def parse_huggingface_url(url: str) -> str:
    """
    Extract repo_id from a HuggingFace URL.
    Supports:
    - https://huggingface.co/user/repo
    - https://huggingface.co/user/repo/tree/main
    - user/repo (returns as-is)
    """
    url = url.strip()

    # Already in user/repo format
    if "/" in url and not url.startswith("http"):
        parts = url.split("/")
        if len(parts) == 2:
            return url

    # Parse URL
    parsed = urlparse(url)
    if "huggingface.co" not in parsed.netloc:
        raise ValueError("Not a valid HuggingFace URL")

    path_parts = parsed.path.strip("/").split("/")
    if len(path_parts) < 2:
        raise ValueError("Invalid HuggingFace URL format")

    return f"{path_parts[0]}/{path_parts[1]}"


def make_progress_tracker_class(download_id: str, download_manager: DownloadManager):
    """Factory function to create a tqdm-like class for huggingface_hub."""
    class _ProgressTracker:
        def __init__(self, total=None, desc=None, unit=None, unit_scale=False, **kwargs):
            self.download_id = download_id
            self.manager = download_manager
            self.total = total or 0
            self.n = 0
            self._last_update = 0
            self._start_time = time.time()

        def update(self, n):
            """Update progress by n bytes."""
            self.n += n
            current_time = time.time()

            # Throttle updates to every 250ms
            if current_time - self._last_update < 0.25:
                return
            self._last_update = current_time

            # Check if download was cancelled
            download = self.manager.get_download(self.download_id)
            if not download or download.state == DownloadState.CANCELLED:
                raise InterruptedError("Download cancelled")

            # Calculate progress
            if self.total > 0:
                pct = min((self.n / self.total * 100), 100)
                self.manager.update_progress(
                    self.download_id,
                    progress=pct,
                    bytes_downloaded=self.n,
                    total_bytes=self.total,
                )

        def close(self):
            """Called when download completes."""
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.close()

    return _ProgressTracker


class ModelManager:
    def list_local_models(self):
        models = []
        if not os.path.exists(MODEL_DIR):
            return []

        for file_path in glob.glob(os.path.join(MODEL_DIR, "*.gguf")):
            filename = os.path.basename(file_path)
            size_bytes = os.path.getsize(file_path)

            models.append(
                {
                    "filename": filename,
                    "friendly_name": filename,
                    "size_mb": round(size_bytes / (1024 * 1024), 2),
                    "path": file_path,
                    "repo_id": "",
                }
            )
        return sorted(models, key=lambda x: x["filename"])

    def list_remote_files(self, repo_id: str):
        # Parse URL if provided
        try:
            repo_id = parse_huggingface_url(repo_id)
        except ValueError:
            pass  # Already parsed or invalid format, let HfApi handle it

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

    def download_model(self, repo_id: str, filename: str, download_id: str = None):
        """
        Download a model from HuggingFace.
        If download_id is provided, updates progress through DownloadManager.
        Returns the local path to the downloaded file.
        """
        # Parse URL if provided
        try:
            repo_id = parse_huggingface_url(repo_id)
        except ValueError:
            pass  # Already parsed or invalid format, let hf_hub_download handle it

        manager = DownloadManager() if download_id else None
        tqdm_class = None

        # Set up progress tracking if download_id provided
        if manager and download_id:
            manager.set_state(download_id, DownloadState.IN_PROGRESS)
            tqdm_class = make_progress_tracker_class(download_id, manager)

        try:
            # Determine local file path
            local_filename = os.path.basename(filename)
            local_path = os.path.join(MODEL_DIR, local_filename)

            # Download with progress tracking
            path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=MODEL_DIR,
                local_dir_use_symlinks=False,
                tqdm_class=tqdm_class,
            )

            if manager and download_id:
                # Get file size for final update
                file_size = os.path.getsize(local_path) if os.path.exists(local_path) else 0
                manager.update_progress(
                    download_id,
                    progress=100.0,
                    bytes_downloaded=file_size,
                    total_bytes=file_size,
                )
                manager.set_state(download_id, DownloadState.COMPLETED, target_path=local_path)

            return local_path

        except InterruptedError:
            if manager and download_id:
                manager.set_state(download_id, DownloadState.CANCELLED)
            raise
        except Exception as e:
            if manager and download_id:
                manager.set_state(download_id, DownloadState.FAILED, error_message=str(e))
            raise
