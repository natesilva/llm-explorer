from llama_cpp import Llama
from app.utils import get_model_path
import math
import threading


class LLMEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMEngine, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        self.lock = threading.Lock()
        model_path = get_model_path()
        # n_gpu_layers=-1 for full Metal offload
        self.model = Llama(
            model_path=model_path,
            n_gpu_layers=-1,
            n_ctx=2048,  # Reasonable context
            logits_all=True,
            verbose=False,
        )

    def get_next_tokens(self, prompt: str, temp: float = 0.8, top_k: int = 40):
        # We generate 1 token but ask for logprobs
        # Note: llama-cpp-python returns logprobs for the *generated* token position

        with self.lock:
            output = self.model.create_completion(
                prompt,
                max_tokens=1,
                temperature=temp,
                top_k=top_k,
                logprobs=top_k,  # We want probabilities for top_k candidates
                echo=False,
            )

        # Parse output
        choice = output["choices"][0]
        # The API structure for logprobs in completion can be tricky.
        # Usually choice['logprobs']['top_logprobs'][0] contains the dict of top tokens

        top_logprobs = choice["logprobs"]["top_logprobs"][0]

        candidates = []
        for token_text, logprob in top_logprobs.items():
            prob = math.exp(logprob)
            candidates.append({"token": token_text, "prob": prob, "logprob": logprob})

        # Apply temperature scaling for visualization
        if temp < 1e-5:
            # Greedy: Max prob gets 100%, others 0%
            if candidates:
                best = max(candidates, key=lambda x: x["prob"])
                for c in candidates:
                    c["prob"] = 100.0 if c == best else 0.0
        else:
            # Apply P' = P^(1/T) and re-normalize
            sum_p = 0.0
            for c in candidates:
                c["prob"] = c["prob"] ** (1.0 / temp)
                sum_p += c["prob"]

            if sum_p > 0:
                for c in candidates:
                    c["prob"] = (c["prob"] / sum_p) * 100.0

        # Sort by probability descending
        candidates.sort(key=lambda x: x["prob"], reverse=True)
        return candidates
