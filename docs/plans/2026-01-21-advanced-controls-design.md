# Advanced Controls Design Document

## 1. Overview
Add "Top-P" (Nucleus Sampling) and "Repetition Penalty" controls to the LLM Explorer. These allow users to visualize how the model cuts off low-probability tokens and how it suppresses repetition.

## 2. Architecture

### Backend (`app/llm.py`)
- **Penalty Logic**: Apply repetition penalty to the Top-K logits *before* softmax/normalization.
  - Formula: If token in context, `logit = logit / penalty` (since logits are negative).
  - Scope: Applied to the Top-K candidates returned by the base inference (Optimization: avoids full vocab scan).
- **Top-P Logic**: Calculate cumulative probability of sorted candidates. Mark tokens as `excluded` if cumulative > `top_p`.
- **API**: Update `get_next_tokens` to accept `top_p` and `repeat_penalty`.

### Frontend
- **Controls**: New sliders for Top-P (0.0-1.0) and Repetition Penalty (1.0-2.0).
- **Visuals**: 
  - Excluded tokens (via Top-P) shown as dimmed/struck-through.
  - Visual indicator (line) for the Top-P threshold.

## 3. Implementation Plan
1.  **Worktree**: `feature/advanced-controls`
2.  **Backend**: Update `llm.py` logic and `schemas.py`.
3.  **Frontend**: Update HTML/JS to add sliders and render exclusion.
4.  **Tests**: Verify penalty math and exclusion logic.
