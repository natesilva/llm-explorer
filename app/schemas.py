from pydantic import BaseModel
from typing import List


class GenerationRequest(BaseModel):
    text: str
    temp: float = 0.8
    top_k: int = 40


class TokenInfo(BaseModel):
    token: str
    prob: float
    logprob: float


class GenerationResponse(BaseModel):
    candidates: List[TokenInfo]
