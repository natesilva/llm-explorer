from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)


@patch("app.main.ModelManager")
def test_list_models(mock_manager_cls):
    mock_instance = mock_manager_cls.return_value
    mock_instance.list_local_models.return_value = [{"filename": "test.gguf"}]

    response = client.get("/models")
    assert response.status_code == 200
    assert response.json() == [{"filename": "test.gguf"}]


@patch("app.main.ModelManager")
def test_lookup_models(mock_manager_cls):
    mock_instance = mock_manager_cls.return_value
    mock_instance.list_remote_files.return_value = [{"filename": "remote.gguf"}]

    response = client.get("/models/lookup?repo_id=test/repo")
    assert response.status_code == 200
    assert response.json() == [{"filename": "remote.gguf"}]
    mock_instance.list_remote_files.assert_called_with("test/repo")


@patch("app.main.ModelManager")
def test_download_model(mock_manager_cls):
    mock_instance = mock_manager_cls.return_value
    mock_instance.download_model.return_value = "/path/to/model"

    payload = {"repo_id": "test/repo", "filename": "model.gguf"}
    response = client.post("/models/download", json=payload)

    assert response.status_code == 200
    assert response.json() == {"status": "success", "path": "/path/to/model"}


@patch("app.main.LLMEngine")
@patch("app.main.os.path.exists")
def test_switch_model(mock_exists, mock_engine_cls):
    mock_exists.return_value = True  # File exists
    mock_engine = mock_engine_cls.return_value

    payload = {"filename": "model.gguf"}
    response = client.post("/models/switch", json=payload)

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_engine.load_model.assert_called_once()
