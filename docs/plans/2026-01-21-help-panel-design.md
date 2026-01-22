# Help Panel Design Document

## 1. Overview
Add a slide-over "Help" panel to explain the various LLM sampling parameters (Temperature, Top-K, Top-P, Penalty) to the user.

## 2. User Interface

### Trigger
- A `?` icon button in the top-right header area.

### Slideover Panel
- **Position**: Fixed, right side, full height.
- **Width**: ~350px on desktop, 100% on mobile.
- **Animation**: Slide in from right (`translateX`).
- **Styling**: Dark theme consistent with app. Semi-transparent backdrop.

### Content
- **Header**: "Parameter Guide" + Close button.
- **Sections**:
  - **Temperature**: "Controls randomness. Low = focused/deterministic. High = creative/diverse."
  - **Top K**: "Limits choices to the top K most likely tokens. Cuts off the long tail of unlikely words."
  - **Top P**: "Nucleus Sampling. dynamic cutoff. Keeps tokens until their cumulative probability hits P."
  - **Penalty**: "Repetition Penalty. Lowers the score of words that have already appeared to reduce repetition."

## 3. Implementation Plan
1.  **Worktree**: `feature/help-panel`
2.  **HTML**: Add panel markup to `index.html`.
3.  **CSS**: Add slide-in styles and backdrop.
4.  **JS**: Add toggle logic.
