from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)


@patch("app.main.LLMEngine")
def test_next_tokens_endpoint(mock_engine_cls):
    # Setup mock
    mock_engine = mock_engine_cls.return_value
    mock_engine.get_next_tokens.return_value = [
        {"token": " world", "prob": 99.0, "logprob": -0.1}
    ]

    payload = {"text": "Hello", "temp": 0.5, "top_k": 10}
    response = client.post("/next-tokens", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["token"] == " world"
