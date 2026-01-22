import os
from unittest.mock import patch
from app.utils import get_model_path


def test_get_model_path_exists():
    # Mocking existence to avoid actual download in test
    with patch("os.path.exists", return_value=True):
        path = get_model_path()
        assert "Meta-Llama-3.1-8B-Instruct-Q8_0.gguf" in path


def test_get_model_path_download_trigger():
    with (
        patch("os.path.exists", return_value=False),
        patch("app.utils.hf_hub_download") as mock_dl,
    ):
        mock_dl.return_value = "/mock/path/model.gguf"
        path = get_model_path()

        mock_dl.assert_called_once()
        assert path == "/mock/path/model.gguf"
