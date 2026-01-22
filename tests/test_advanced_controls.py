from unittest.mock import MagicMock, patch
from app.llm import LLMEngine
import pytest


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_repetition_penalty(mock_get_path, mock_llama):
    # Reset singleton
    LLMEngine._instance = None

    mock_get_path.return_value = "/dummy"
    mock_instance = MagicMock()
    mock_llama.return_value = mock_instance

    # Mock logprobs: "apple" (high), "banana" (low)
    # apple logprob approx -0.1, banana approx -2.0
    mock_instance.create_completion.return_value = {
        "choices": [{"logprobs": {"top_logprobs": [{"apple": -0.1, "banana": -2.0}]}}]
    }

    engine = LLMEngine()

    # Case 1: No penalty
    # "apple" should remain high
    res1 = engine.get_next_tokens("I like apple", repeat_penalty=1.0)
    prob1 = res1[0]["prob"]

    # Case 2: Penalty 2.0
    # "apple" is in context, so should be penalized
    res2 = engine.get_next_tokens("I like apple", repeat_penalty=2.0)
    prob2 = res2[0]["prob"]

    assert prob2 < prob1, "Penalized token should have lower probability"


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_top_p_exclusion(mock_get_path, mock_llama):
    # Reset singleton
    LLMEngine._instance = None

    mock_get_path.return_value = "/dummy"
    mock_instance = MagicMock()
    mock_llama.return_value = mock_instance

    # Mock return
    mock_instance.create_completion.return_value = {
        "choices": [{"logprobs": {"top_logprobs": [{"A": -0.2, "B": -1.0, "C": -2.0}]}}]
    }

    engine = LLMEngine()

    # With T=1.0, approx probs: A=0.81, B=0.36... wait exp(-0.2)=0.81.
    # Sum will be > 1 because these are just Top K examples not full dist.
    # Logic re-normalizes.

    res = engine.get_next_tokens("test", top_p=0.5)

    # A should be included (cum prob starts at 0, adds A's prob)
    # If A's prob > 0.5, then B should be excluded?
    # Nucleus sampling includes tokens UNTIL sum >= P.
    # So if A=0.8, sum=0.8 >= 0.5. A is included. B is excluded.

    assert res[0]["token"] == "A"
    assert res[0]["excluded"] is False
    assert res[1]["excluded"] is True

    # With T=1.0, approx probs: A=0.81, B=0.36... wait exp(-0.2)=0.81.
    # Sum will be > 1 because these are just Top K examples not full dist.
    # Logic re-normalizes.

    res = engine.get_next_tokens("test", top_p=0.5)

    # A should be included (cum prob starts at 0, adds A's prob)
    # If A's prob > 0.5, then B should be excluded?
    # Nucleus sampling includes tokens UNTIL sum >= P.
    # So if A=0.8, sum=0.8 >= 0.5. A is included. B is excluded.

    assert res[0]["token"] == "A"
    assert res[0]["excluded"] is False
    assert res[1]["excluded"] is True
