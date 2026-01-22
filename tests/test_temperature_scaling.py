from unittest.mock import MagicMock, patch
from app.llm import LLMEngine
import math


@patch("app.llm.Llama")
@patch("app.llm.get_model_path")
def test_temperature_scaling(mock_get_path, mock_llama):
    # Setup
    mock_get_path.return_value = "/dummy/path"
    mock_instance = MagicMock()
    mock_llama.return_value = mock_instance

    # Mock output: Two tokens with equal prob (logprob = ln(0.5) approx -0.693)
    # Actually let's use distinct probs: A=0.8, B=0.2
    # log(0.8) = -0.223, log(0.2) = -1.609

    mock_instance.create_completion.return_value = {
        "choices": [{"logprobs": {"top_logprobs": [{"A": -0.22314, "B": -1.60944}]}}]
    }

    engine = LLMEngine()

    # Test T=1.0 (Baseline)
    # Prob should be close to 80% and 20%
    res_1 = engine.get_next_tokens("test", temp=1.0)
    top_1 = res_1[0]
    assert top_1["token"] == "A"
    assert abs(top_1["prob"] - 80.0) < 1.0  # Tolerance for normalization/rounding

    # Test T=0.5 (Sharpening)
    # A' = 0.8^2 = 0.64
    # B' = 0.2^2 = 0.04
    # Sum = 0.68
    # New A% = 0.64/0.68 = 94.1%
    res_low = engine.get_next_tokens("test", temp=0.5)
    top_low = res_low[0]
    assert top_low["token"] == "A"
    assert top_low["prob"] > 80.0  # Should be higher than baseline

    # Test T=2.0 (Flattening)
    # A' = 0.8^0.5 = 0.894
    # B' = 0.2^0.5 = 0.447
    # Sum = 1.341
    # New A% = 0.894/1.341 = 66.6%
    res_high = engine.get_next_tokens("test", temp=2.0)
    top_high = res_high[0]
    assert top_high["token"] == "A"
    assert top_high["prob"] < 80.0  # Should be lower than baseline

    print("Temperature scaling tests passed!")
