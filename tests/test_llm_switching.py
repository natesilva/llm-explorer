from unittest.mock import MagicMock, patch
from app.llm import LLMEngine
import pytest


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_load_model(mock_get_path, mock_llama):
    # Setup
    mock_get_path.return_value = "/dummy"

    # Configure Llama to return different instances
    mock_llama.side_effect = [MagicMock(name="Model1"), MagicMock(name="Model2")]

    engine = LLMEngine()  # Initial load -> Model1

    old_model = engine.model

    # Switch
    new_path = "/new/model.gguf"
    engine.load_model(new_path)  # -> Model2

    # Verify
    mock_llama.assert_called_with(
        model_path=new_path, n_gpu_layers=-1, n_ctx=2048, verbose=False
    )
    assert engine.model is not old_model  # Mock creates new instance each call?
    # Actually if mock_llama is the CLASS, calling it returns a NEW instance.
    # Yes.
