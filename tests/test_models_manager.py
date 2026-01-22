from app.models_manager import ModelManager, MODEL_DIR
import os
from unittest.mock import patch, MagicMock


def test_list_local_models(tmp_path):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    (models_dir / "model1.gguf").touch()

    with patch("app.models_manager.MODEL_DIR", str(models_dir)):
        manager = ModelManager()
        models = manager.list_local_models()
        assert len(models) == 1
        assert models[0]["filename"] == "model1.gguf"


@patch("app.models_manager.HfApi")
def test_list_remote_models(mock_api_cls):
    mock_api = mock_api_cls.return_value
    mock_file = MagicMock()
    mock_file.rfilename = "model.gguf"
    mock_file.size = 1024 * 1024 * 5
    # Mocking as if it has rfilename and size (duck typing)

    mock_api.list_repo_tree.return_value = [mock_file]

    manager = ModelManager()
    files = manager.list_remote_files("test/repo")

    assert len(files) == 1
    assert files[0]["filename"] == "model.gguf"
