from llama_cpp import Llama
from llama_cpp._internals import LlamaModel
from app.utils import get_model_path
import math
import threading
import uuid
import random

# Workaround for llama-cpp-python bug where __del__ tries to access
# self.sampler before checking if it exists
_original_close = LlamaModel.close
def _safe_close(self):
    if hasattr(self, 'sampler'):
        _original_close(self)
LlamaModel.close = _safe_close


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

        # Store the current model path
        self.current_model_path = model_path

        # n_gpu_layers=-1 for full Metal offload
        self.model = Llama(
            model_path=model_path,
            n_gpu_layers=-1,
            n_ctx=2048,  # Reasonable context
            verbose=False,
            logits_all=True,
        )
        print(f"Model loaded: {model_path}")

    def get_current_model(self) -> str:
        """Return the path to the currently loaded model."""
        return getattr(self, "current_model_path", None)

    def get_next_tokens(
        self,
        prompt: str,
        temp: float = 0.8,
        top_k: int = 40,
        top_p: float = 0.95,
        repeat_penalty: float = 1.0,
    ):
        # Try with requested logprobs first
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
        top_logprobs_list = choice["logprobs"].get("top_logprobs", [])

        # If top_logprobs is empty, retry with smaller logprobs value (llama-cpp-python bug workaround)
        if not top_logprobs_list:
            print(f"DEBUG: Empty top_logprobs, retrying with logprobs=10...")
            with self.lock:
                output = self.model.create_completion(
                    prompt,
                    max_tokens=1,
                    temperature=temp,
                    top_k=top_k,
                    logprobs=10,  # Use smaller value
                    echo=False,
                )
            choice = output["choices"][0]
            top_logprobs_list = choice["logprobs"].get("top_logprobs", [])

            # If still empty, generate without logprobs and create a fake candidate
            if not top_logprobs_list:
                print(f"DEBUG: Still empty, generating without logprobs...")
                with self.lock:
                    output = self.model.create_completion(
                        prompt,
                        max_tokens=1,
                        temperature=temp,
                        top_k=top_k,
                        echo=False,
                    )
                choice = output["choices"][0]
                token_text = choice.get("text", "")
                if token_text:
                    # Create a single candidate with default probability
                    return [{"token": token_text, "prob": 100.0, "logprob": 0.0, "excluded": False,
                             "cumulative_prob": 100.0}]
                raise ValueError("Failed to generate token")

        top_logprobs = top_logprobs_list[0]

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

    def generate_beam_paths(
        self,
        context: str,
        num_paths: int = 3,
        depth: int = 1,
        temp: float = 0.8,
        top_k: int = 40,
        top_p: float = 0.95,
        repeat_penalty: float = 1.0,
    ) -> list:
        """
        Generate multiple divergent paths from the given context.
        Each path samples a different token from the top candidates.
        Returns a list of path dictionaries with id, text, tokens, and cumulative_prob.
        """
        # Get top candidates for the current context
        candidates = self.get_next_tokens(
            context,
            temp=temp,
            top_k=top_k,
            top_p=top_p,
            repeat_penalty=repeat_penalty,
        )

        # Filter to only non-excluded candidates
        valid_candidates = [c for c in candidates if not c.get("excluded", False)]

        # Select diverse tokens from the top candidates
        # We want num_paths distinct starting points
        selected_indices = []
        if len(valid_candidates) <= num_paths:
            selected_indices = list(range(len(valid_candidates)))
        else:
            # Use a mix of top tokens and some sampling for diversity
            # Always include the top token, then sample from the rest
            selected_indices = [0]
            remaining = list(range(1, len(valid_candidates)))
            # Sample with probability proportional to rank (higher rank = more likely)
            weights = [1.0 / (i + 1) for i in range(len(remaining))]
            weights = [w / sum(weights) for w in weights]
            selected_indices.extend(random.choices(
                remaining,
                weights=weights,
                k=min(num_paths - 1, len(remaining))
            ))

        paths = []
        for idx in selected_indices[:num_paths]:
            candidate = valid_candidates[idx]
            token_text = candidate["token"]
            token_prob = candidate["prob"] / 100.0  # Convert back from percentage

            # Build the path
            new_text = context + token_text
            path_tokens = [{"token": token_text, "prob": token_prob}]

            # Extend the path to the requested depth
            current_text = new_text
            for _ in range(depth - 1):
                next_candidates = self.get_next_tokens(
                    current_text,
                    temp=temp,
                    top_k=top_k,
                    top_p=top_p,
                    repeat_penalty=repeat_penalty,
                )
                valid_next = [c for c in next_candidates if not c.get("excluded", False)]
                if valid_next:
                    # Pick the top token for extending
                    next_token = valid_next[0]
                    next_prob = next_token["prob"] / 100.0
                    path_tokens.append({"token": next_token["token"], "prob": next_prob})
                    current_text += next_token["token"]
                else:
                    break

            # Calculate cumulative probability (product of all token probs)
            cumulative_prob = 1.0
            for t in path_tokens:
                cumulative_prob *= t["prob"]

            paths.append({
                "id": str(uuid.uuid4()),
                "text": current_text,
                "tokens": path_tokens,
                "cumulative_prob": cumulative_prob,
            })

        # Sort by cumulative probability (most promising first)
        paths.sort(key=lambda p: p["cumulative_prob"], reverse=True)
        return paths
