from app.schemas import GenerationRequest, TokenInfo, GenerationResponse
from pydantic import ValidationError
import pytest


def test_request_fields():
    # Should accept new fields
    req = GenerationRequest(
        text="foo", temp=0.8, top_k=40, top_p=0.9, repeat_penalty=1.1
    )
    assert req.top_p == 0.9
    assert req.repeat_penalty == 1.1


def test_token_info_fields():
    info = TokenInfo(
        token="test", prob=50.0, logprob=-0.5, cumulative_prob=50.0, excluded=False
    )
    assert info.cumulative_prob == 50.0
    assert info.excluded is False
