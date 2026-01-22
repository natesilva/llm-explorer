from app.models_manager import ModelManager
import os
from unittest.mock import patch


def test_list_local_models(tmp_path):
    # Setup dummy models dir
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    (models_dir / "model1.gguf").touch()
    (models_dir / "readme.txt").touch()  # Should be ignored

    with patch("app.models_manager.MODEL_DIR", str(models_dir)):
        manager = ModelManager()
        models = manager.list_local_models()
        assert len(models) == 1
        assert models[0]["filename"] == "model1.gguf"
        assert "size_mb" in models[0]
