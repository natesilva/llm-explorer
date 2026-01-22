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
