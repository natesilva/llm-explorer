from unittest.mock import MagicMock, patch
import pytest
from app.llm import LLMEngine


@pytest.fixture(autouse=True)
def reset_singleton():
    LLMEngine._instance = None
    yield
    LLMEngine._instance = None


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_engine_initialization(mock_get_path, mock_llama):
    mock_get_path.return_value = "/path/to/model.gguf"
    engine = LLMEngine()

    mock_llama.assert_called_once()
    assert engine.model is not None


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_get_next_tokens(mock_get_path, mock_llama):
    # Setup mock return for create_completion
    mock_instance = MagicMock()
    mock_llama.return_value = mock_instance

    # Mock logprobs output
    mock_instance.create_completion.return_value = {
        "choices": [{"logprobs": {"top_logprobs": [{"token1": -0.1, "token2": -0.5}]}}]
    }

    engine = LLMEngine()
    tokens = engine.get_next_tokens("Hello", temp=0.7, top_k=40)

    mock_instance.create_completion.assert_called_with(
        "Hello",
        max_tokens=1,
        temperature=0.7,
        top_k=40,
        logprobs=40,  # Request slightly more to filter
        echo=False,
    )
    assert len(tokens) > 0
