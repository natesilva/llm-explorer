import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, Optional, Callable
import os


class DownloadState(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class DownloadInfo:
    download_id: str
    repo_id: str
    filename: str
    state: DownloadState = DownloadState.PENDING
    progress: float = 0.0  # Percentage 0-100
    bytes_downloaded: int = 0
    total_bytes: int = 0
    error_message: str = ""
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    target_path: Optional[str] = None


class DownloadManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._downloads: Dict[str, DownloadInfo] = {}
        self._downloads_lock = threading.RLock()
        self._active_threads: Dict[str, threading.Thread] = {}

    def create_download(self, repo_id: str, filename: str) -> str:
        download_id = str(uuid.uuid4())
        with self._downloads_lock:
            self._downloads[download_id] = DownloadInfo(
                download_id=download_id,
                repo_id=repo_id,
                filename=filename,
            )
        return download_id

    def get_download(self, download_id: str) -> Optional[DownloadInfo]:
        with self._downloads_lock:
            return self._downloads.get(download_id)

    def get_all_downloads(self) -> list:
        with self._downloads_lock:
            return list(self._downloads.values())

    def get_active_downloads(self) -> list:
        with self._downloads_lock:
            return [
                d for d in self._downloads.values()
                if d.state in (DownloadState.PENDING, DownloadState.IN_PROGRESS)
            ]

    def update_progress(
        self,
        download_id: str,
        progress: float = None,
        bytes_downloaded: int = None,
        total_bytes: int = None,
    ):
        with self._downloads_lock:
            download = self._downloads.get(download_id)
            if download:
                if progress is not None:
                    download.progress = progress
                if bytes_downloaded is not None:
                    download.bytes_downloaded = bytes_downloaded
                if total_bytes is not None:
                    download.total_bytes = total_bytes

    def set_state(
        self,
        download_id: str,
        state: DownloadState,
        error_message: str = "",
        target_path: str = None,
    ):
        with self._downloads_lock:
            download = self._downloads.get(download_id)
            if download:
                download.state = state
                if error_message:
                    download.error_message = error_message
                if target_path:
                    download.target_path = target_path
                if state in (DownloadState.COMPLETED, DownloadState.FAILED, DownloadState.CANCELLED):
                    download.completed_at = datetime.now()

    def start_download_thread(
        self,
        download_id: str,
        download_func: Callable,
    ):
        def run_download():
            try:
                download_func()
            except Exception as e:
                self.set_state(download_id, DownloadState.FAILED, str(e))

        thread = threading.Thread(target=run_download, daemon=True)
        with self._downloads_lock:
            self._active_threads[download_id] = thread
        thread.start()

    def cancel_download(self, download_id: str) -> bool:
        with self._downloads_lock:
            download = self._downloads.get(download_id)
            if download and download.state in (DownloadState.PENDING, DownloadState.IN_PROGRESS):
                self.set_state(download_id, DownloadState.CANCELLED)
                # Note: actual cancellation will be handled by checking state in download loop
                return True
        return False

    def cleanup_old_downloads(self, max_age_hours: int = 24):
        cutoff = datetime.now().timestamp() - (max_age_hours * 3600)
        with self._downloads_lock:
            to_remove = [
                did for did, d in self._downloads.items()
                if d.completed_at and d.completed_at.timestamp() < cutoff
            ]
            for did in to_remove:
                del self._downloads[did]
                self._active_threads.pop(did, None)
            return len(to_remove)

    def to_dict(self, download: DownloadInfo) -> dict:
        return {
            "download_id": download.download_id,
            "repo_id": download.repo_id,
            "filename": download.filename,
            "state": download.state.value,
            "progress": round(download.progress, 1),
            "bytes_downloaded": download.bytes_downloaded,
            "total_bytes": download.total_bytes,
            "error_message": download.error_message,
            "started_at": download.started_at.isoformat(),
            "completed_at": download.completed_at.isoformat() if download.completed_at else None,
            "target_path": download.target_path,
        }
