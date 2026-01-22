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
        self.load_model(model_path)

    def load_model(self, model_path: str):
        if hasattr(self, "lock"):
            with self.lock:
                self._load_internal(model_path)
        else:
            self._load_internal(model_path)

    def _load_internal(self, model_path):
        if hasattr(self, "model") and self.model:
            del self.model
            import gc

            gc.collect()

        # n_gpu_layers=-1 for full Metal offload
        self.model = Llama(
            model_path=model_path,
            n_gpu_layers=-1,
            n_ctx=2048,  # Reasonable context
            verbose=False,
        )

    def get_next_tokens(
        self,
        prompt: str,
        temp: float = 0.8,
        top_k: int = 40,
        top_p: float = 0.95,
        repeat_penalty: float = 1.0,
    ):
        with self.lock:
            output = self.model.create_completion(
                prompt,
                max_tokens=1,
                temperature=temp,
                top_k=top_k,
                logprobs=top_k,
                echo=False,
            )

        choice = output["choices"][0]
        top_logprobs = choice["logprobs"]["top_logprobs"][0]

        candidates = []

        # Helper to check if token is in context (simple string match for demo)
        # Real implementation would use token IDs.
        # This is an approximation.

        for token_text, logprob in top_logprobs.items():
            # Apply Repetition Penalty (Approximate)
            # If token appears in prompt, penalize logprob
            # We treat logprob as logit for this approximation

            # Simple check: is the token text in the prompt?
            # Note: token_text might have leading space.
            clean_token = token_text.strip()
            if clean_token and clean_token in prompt:
                # Apply penalty. If logprob < 0 and penalty > 1,
                # we make it MORE negative (smaller prob).
                # logprob * penalty
                logprob = logprob * repeat_penalty

            prob = math.exp(logprob)
            candidates.append({"token": token_text, "prob": prob, "logprob": logprob})

        # Apply Temperature (Reuse existing logic)
        if temp < 1e-5:
            if candidates:
                best = max(candidates, key=lambda x: x["prob"])
                for c in candidates:
                    c["prob"] = 100.0 if c == best else 0.0
        else:
            sum_p = 0.0
            for c in candidates:
                c["prob"] = c["prob"] ** (1.0 / temp)
                sum_p += c["prob"]

            if sum_p > 0:
                for c in candidates:
                    c["prob"] = (c["prob"] / sum_p) * 100.0

        # Sort by probability descending
        candidates.sort(key=lambda x: x["prob"], reverse=True)

        # Calculate Top-P Exclusion
        current_cum = 0.0
        cutoff_reached = False

        for c in candidates:
            current_cum += c["prob"]
            c["cumulative_prob"] = current_cum

            if cutoff_reached:
                c["excluded"] = True
            else:
                c["excluded"] = False

            # If this token pushes us over Top-P, subsequent ones are excluded
            # (Note: Standard Top-P includes the token that crosses the threshold)
            if current_cum >= (top_p * 100.0):  # top_p is 0-1, probs are 0-100
                cutoff_reached = True

        return candidates
