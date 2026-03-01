# Design: Next Token Reveal Toggle

**Date:** 2026-02-28
**Status:** Approved

## Problem

When presenting the app to a class, the instructor wants to hide the Next Token panel so students can guess which token(s) come next before seeing the model's answer.

## Design

### Option chosen: CSS blur on content areas (Option A)

Blur only the two view-content divs (`#candidates-view` and `#beam-view`). The panel title row — "Next Token" heading, Tokens/Beam view toggles, and auto-infer button — remains fully visible. Inference continues uninterrupted while hidden, so reveal is instant.

### HTML

Add one button to the header, between the theme toggle and the GitHub link:

```html
<button id="reveal-toggle" class="icon-btn" title="Hide/reveal next tokens">👁</button>
```

### CSS

```css
.tokens-hidden {
    filter: blur(10px);
    pointer-events: none;
    user-select: none;
}
```

Applied to `#candidates-view` and `#beam-view` when in hidden state.

### JavaScript

Mirrors the existing theme toggle pattern:

- `let tokensHidden = false` — module-level state variable
- `initRevealState()` — reads `localStorage.getItem('tokens-hidden')` on page load
- `setRevealState(hidden)` — toggles `.tokens-hidden` on both view-content divs, updates button icon (👁 revealed / 🙈 hidden), persists to localStorage
- Click listener on `#reveal-toggle`

No backend changes required.

## Out of Scope

- Blurring the panel title row
- Pausing inference while hidden
- Keyboard shortcut
