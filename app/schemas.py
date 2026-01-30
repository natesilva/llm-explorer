from pydantic import BaseModel
from typing import List, Optional


class GenerationRequest(BaseModel):
    text: str
    temp: float = 0.8
    top_k: int = 40
    top_p: float = 0.95
    repeat_penalty: float = 1.0


class TokenInfo(BaseModel):
    token: str
    prob: float
    logprob: float
    cumulative_prob: Optional[float] = 0.0
    excluded: Optional[bool] = False


class GenerationResponse(BaseModel):
    candidates: List[TokenInfo]


class BeamPathToken(BaseModel):
    token: str
    prob: float


class BeamPath(BaseModel):
    id: str
    text: str
    tokens: List[BeamPathToken]
    cumulative_prob: float  # Product of all token probabilities


class BeamSearchRequest(BaseModel):
    context: str
    num_paths: int = 3  # Number of paths to generate
    depth: int = 1  # Initial depth (tokens per path)


class BeamSearchResponse(BaseModel):
    paths: List[BeamPath]


class SwitchModelRequest(BaseModel):
    filename: str


class DownloadModelRequest(BaseModel):
    repo_id: str
    filename: str


class DownloadStartResponse(BaseModel):
    download_id: str
    status: str


class DownloadStatusInfo(BaseModel):
    download_id: str
    repo_id: str
    filename: str
    state: str
    progress: float
    bytes_downloaded: int
    total_bytes: int
    error_message: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    target_path: Optional[str] = None


class DownloadsStatusResponse(BaseModel):
    downloads: List[DownloadStatusInfo]
    active_count: int
