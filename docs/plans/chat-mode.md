# Chat Mode Feature Plan

## Overview

Add a new "Chat" mode to the left panel, allowing users to switch between the existing "Context" mode and a conversational "Chat" interface. The Chat mode demonstrates how LLM chat applications work with a system prompt, alternating USER/ASSISTANT turns, and auto-inference that stops at the end token.

## Current State Analysis

### Existing Architecture
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 with CSS custom properties
- **Backend**: FastAPI with llama-cpp-python
- **Left Panel** (`index.html:92-167`): Single context textarea with starter texts dropdown
- **Auto-inference** (`app.js:136-192`): Runs at 5 tokens/second, weighted random selection
- **Stop token detection** (`app.js:292-302`): Already checks for `<|end_of_text|>`, `<|eot|>`, `</s>`, `<end>`, `<|END|>`
- **View toggle pattern** (`app.js:841-872`): Already exists for Tokens/Beam views

### Existing Chat Starter Texts
The starter dropdown already includes chat-style prompts:
- "Chat: User asks about France" (lines 124-127)
- "Chat: System instruction (rhyme)" (lines 129-132)

These use the format:
```
SYSTEM INSTRUCTION: You are a helpful assistant...
USER: [question]
ASSISTANT:
```

## Requirements

1. **Mode Toggle**: Switch between "Context" (existing) and "Chat" (new) modes
2. **System Prompt Section**: Pre-populated with default system instruction
3. **Chat Messages Display**: Show conversation history with USER/ASSISTANT bubbles
4. **User Input**: Textarea for entering new USER messages
5. **Auto-Inference Integration**: Generate ASSISTANT responses token-by-token until stop token
6. **Multi-turn Support**: After assistant completes, allow next USER input

## Implementation Plan

### Phase 1: HTML Structure Changes

**File**: `app/static/index.html`

**Changes to left panel** (lines 92-167):

```html
<div class="panel left">
    <div class="panel-title-row">
        <h2>Input</h2>
        <div class="mode-toggles">
            <button class="mode-toggle active" data-mode="context">Context</button>
            <button class="mode-toggle" data-mode="chat">Chat</button>
        </div>
    </div>

    <!-- Context Mode (existing) -->
    <div id="context-mode" class="mode-content active">
        <div class="context-controls">
            <select id="starter-select" class="starter-dropdown">
                <!-- existing options -->
            </select>
            <button id="clear-context" class="icon-btn">✕</button>
        </div>
        <textarea id="context-window" dir="auto"></textarea>
    </div>

    <!-- Chat Mode (new) -->
    <div id="chat-mode" class="mode-content hidden">
        <div class="chat-system-prompt">
            <div class="system-controls">
                <label>System Preset</label>
                <select id="system-preset-select" class="system-dropdown">
                    <option value="standard">Standard Assistant</option>
                    <option value="rhyme">Rhyming Assistant</option>
                    <option value="creative">Creative Writing Partner</option>
                    <option value="code">Code Helper</option>
                    <option value="concise">Concise Responder</option>
                    <option value="educator">Educator</option>
                </select>
            </div>
            <label>System Prompt</label>
            <textarea id="system-prompt" rows="2">SYSTEM INSTRUCTION: You are a helpful, accurate assistant that responds clearly and concisely. End your response with:<|end_of_text|></textarea>
        </div>
        <div class="chat-messages" id="chat-messages">
            <div class="chat-empty-state">Start a conversation...</div>
        </div>
        <div class="chat-input-area">
            <textarea id="chat-user-input" placeholder="Type your message..." rows="2"></textarea>
            <button id="chat-send-btn">Send ▶</button>
        </div>
    </div>
</div>
```

**Notes**:
- Move starter texts dropdown into Context mode only
- Chat mode gets its own UI components
- Mode toggle follows existing view-toggle pattern

### Phase 2: CSS Styling

**File**: `app/static/style.css`

**Add new styles**:

```css
/* Mode toggles (similar to view-toggles) */
.mode-toggles {
    position: absolute;
    right: 0;
    display: flex;
    gap: 0.25rem;
}

.panel-title-row {
    justify-content: center;
}

.mode-toggle {
    background: none;
    border: 1px solid var(--border-color);
    color: var(--secondary-text);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
}

.mode-toggle.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
}

/* Mode content visibility */
.mode-content {
    display: none;
    flex: 1;
    flex-direction: column;
}

.mode-content.active {
    display: flex;
}

/* Chat mode styles */
.chat-system-prompt {
    margin-bottom: 0.75rem;
}

.chat-system-prompt label {
    display: block;
    font-size: 0.8rem;
    color: var(--secondary-text);
    margin-bottom: 0.25rem;
}

.chat-system-prompt textarea {
    flex: none;
    min-height: 50px;
    padding: 0.5rem;
    font-size: 0.85rem;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    background: var(--panel-bg);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    margin-bottom: 0.75rem;
}

.chat-empty-state {
    color: var(--secondary-text);
    text-align: center;
    padding: 2rem;
    font-style: italic;
}

.chat-message {
    margin-bottom: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    max-width: 85%;
}

.chat-message.user {
    background: var(--accent);
    color: white;
    margin-left: auto;
    text-align: right;
}

.chat-message.assistant {
    background: var(--item-bg);
    color: var(--text-color);
}

.chat-message .role-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 0.25rem;
}

.chat-message.generating {
    opacity: 0.8;
}

.chat-message.generating::after {
    content: "▊";
    animation: blink 1s infinite;
}

@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}

.chat-input-area {
    display: flex;
    gap: 0.5rem;
}

.chat-input-area textarea {
    flex: 1;
    min-height: 50px;
}

.chat-input-area button {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0 1rem;
    cursor: pointer;
}

.chat-input-area button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

### Phase 3: JavaScript State Management

**File**: `app/static/app.js`

**Add new state variables** (after line 31):

```javascript
// Chat mode state
let currentMode = 'context';  // 'context' or 'chat'
let chatMessages = [];  // Array of {role: 'user'|'assistant', content: string}
let isGeneratingResponse = false;
let currentAssistantContent = '';
```

### Phase 4: Mode Switching

**Add mode toggle handlers** (after existing event listeners):

```javascript
// Mode toggles
const modeToggles = document.querySelectorAll('.mode-toggle');
const contextMode = document.getElementById('context-mode');
const chatMode = document.getElementById('chat-mode');
const systemPromptInput = document.getElementById('system-prompt');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatUserInput = document.getElementById('chat-user-input');
const chatSendBtn = document.getElementById('chat-send-btn');

modeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        switchMode(mode);
    });
});

function switchMode(mode) {
    currentMode = mode;
    modeToggles.forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    if (mode === 'context') {
        contextMode.classList.remove('hidden');
        contextMode.classList.add('active');
        chatMode.classList.remove('active');
        chatMode.classList.add('hidden');
        // Sync chat messages to context textarea
        syncChatToContext();
    } else {
        chatMode.classList.remove('hidden');
        chatMode.classList.add('active');
        contextMode.classList.remove('active');
        contextMode.classList.add('hidden');
        // Sync context textarea to chat (if it looks like chat format)
        syncContextToChat();
        renderChatMessages();
    }
}
```

### Phase 5: Chat Message Management

**Add chat functions**:

```javascript
function syncChatToContext() {
    // Build full context from chat messages
    const systemPrompt = systemPromptInput.value.trim();
    let fullContext = systemPrompt;

    chatMessages.forEach(msg => {
        if (msg.role === 'user') {
            fullContext += '\n\nUSER: ' + msg.content;
        } else {
            fullContext += '\n\nASSISTANT: ' + msg.content;
        }
    });

    // If assistant is currently generating, add their label
    if (isGeneratingResponse) {
        fullContext += '\n\nASSISTANT:' + currentAssistantContent;
    }

    contextInput.value = fullContext;
}

function syncContextToChat() {
    const text = contextInput.value.trim();
    if (!text) return;

    // Simple parser for chat format
    const messages = [];
    const systemMatch = text.match(/SYSTEM INSTRUCTION:(.*?)(?=USER:|$)/s);
    if (systemMatch) {
        systemPromptInput.value = 'SYSTEM INSTRUCTION:' + systemMatch[1].trim();
    }

    const userMatches = text.matchAll(/USER:\s*(.*?)(?=ASSISTANT:|USER:|$)/gs);
    const assistantMatches = text.matchAll(/ASSISTANT:\s*(.*?)(?=USER:|ASSISTANT:|$)/gs);

    // Simple alternating parse (could be improved)
    let inUser = false;
    let inAssistant = false;
    let currentContent = '';

    // This is simplified - real implementation would need proper parsing
    // For now, if context doesn't look like chat, leave chat empty
}

function renderChatMessages() {
    chatMessagesContainer.innerHTML = '';

    if (chatMessages.length === 0 && !isGeneratingResponse) {
        chatMessagesContainer.innerHTML = '<div class="chat-empty-state">Start a conversation...</div>';
        return;
    }

    chatMessages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${msg.role}`;
        msgDiv.innerHTML = `
            <div class="role-label">${msg.role}</div>
            <div class="content">${escapeHtml(msg.content)}</div>
        `;
        chatMessagesContainer.appendChild(msgDiv);
    });

    // Add generating assistant message if active
    if (isGeneratingResponse) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message assistant generating';
        msgDiv.innerHTML = `
            <div class="role-label">assistant</div>
            <div class="content">${escapeHtml(currentAssistantContent)}</div>
        `;
        chatMessagesContainer.appendChild(msgDiv);
    }

    // Scroll to bottom
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function addUserMessage(content) {
    chatMessages.push({ role: 'user', content });
    currentAssistantContent = '';
    renderChatMessages();
}

function addAssistantToken(token) {
    currentAssistantContent += token;
    renderChatMessages();
}

function finishAssistantMessage() {
    if (currentAssistantContent) {
        chatMessages.push({ role: 'assistant', content: currentAssistantContent });
    }
    currentAssistantContent = '';
    isGeneratingResponse = false;
    renderChatMessages();
    chatUserInput.disabled = false;
    chatSendBtn.disabled = false;
    chatUserInput.focus();
}
```

### Phase 6: Auto-Inference Modifications

**Modify `selectToken` function** (lines 277-310):

```javascript
async function selectToken(token) {
    if (isSelectingToken) {
        return;
    }
    isSelectingToken = true;

    if (currentMode === 'chat' && isGeneratingResponse) {
        // Chat mode: append to assistant response
        addAssistantToken(token);
        syncChatToContext();
    } else {
        // Context mode: original behavior
        contextInput.value += token;
        lastSelectedToken = token;
        contextInput.scrollTop = contextInput.scrollHeight;
    }

    // Check for end token
    const endTokenPatterns = ['<|end_of_text|>', '<|eot|>', '</s>', '<end>', '<|END|>'];
    const text = currentMode === 'chat' && isGeneratingResponse
        ? currentAssistantContent
        : contextInput.value;

    for (const pattern of endTokenPatterns) {
        if (text.endsWith(pattern)) {
            if (autoInferRunning) {
                stopAutoInfer();
            }
            if (currentMode === 'chat' && isGeneratingResponse) {
                finishAssistantMessage();
            }
            isSelectingToken = false;
            return;
        }
    }

    await fetchCandidates();
    isSelectingToken = false;
}
```

### Phase 7: System Presets

**Add system preset handler**:

```javascript
const systemPresetSelect = document.getElementById('system-preset-select');

const SYSTEM_PRESETS = {
    standard: 'SYSTEM INSTRUCTION: You are a helpful, accurate assistant that responds clearly and concisely. End your response with:<|end_of_text|>',
    rhyme: 'SYSTEM INSTRUCTION: You are a helpful assistant that always responds in rhyme. End your response with:<|end_of_text|>',
    creative: 'SYSTEM INSTRUCTION: You are a creative writing partner. You help with stories, poetry, and creative projects. Be imaginative and descriptive. End your response with:<|end_of_text|>',
    code: 'SYSTEM INSTRUCTION: You are a coding assistant. You help with programming questions, write code, and debug issues. Provide clear explanations and code examples. End your response with:<|end_of_text|>',
    concise: 'SYSTEM INSTRUCTION: You are a concise assistant. You respond with brief, to-the-point answers. End your response with:<|end_of_text|>',
    educator: 'SYSTEM INSTRUCTION: You are an educator. You explain concepts clearly, use examples, and check for understanding. End your response with:<|end_of_text|>'
};

systemPresetSelect.addEventListener('change', (e) => {
    const preset = e.target.value;
    systemPromptInput.value = SYSTEM_PRESETS[preset];
    syncChatToContext();
});
```

### Phase 8: Chat Send Button Handler

**Add chat send handler**:

```javascript
chatSendBtn.addEventListener('click', sendChatMessage);
chatUserInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

async function sendChatMessage() {
    const content = chatUserInput.value.trim();
    if (!content) return;

    // Add user message
    addUserMessage(content);
    chatUserInput.value = '';

    // Prepare for assistant response
    isGeneratingResponse = true;
    currentAssistantContent = '';
    chatUserInput.disabled = true;
    chatSendBtn.disabled = true;

    // Sync to context and fetch candidates
    syncChatToContext();
    await fetchCandidates();

    // Start auto-inference
    startAutoInfer();
}
```

### Phase 9: Cross-Mode Considerations

**Handle view switching with active generation**:

- If auto-inference is running in Context mode and user switches to Chat mode, stop generation
- If auto-inference is running in Chat mode and user switches to Context mode, stop generation
- Beam view works in both modes: in Chat mode it shows continuations for the next assistant turn

**No view toggle restrictions needed** - beam view is fully functional in Chat mode since `syncChatToContext()` always keeps the context textarea updated with the full prompt.

### Phase 9: Edge Cases & Error Handling

1. **Empty system prompt**: Default to provided template
2. **User sends while generating**: Disable send button during generation
3. **Model switch during chat**: Clear chat state or preserve
4. **Stop token not found**: Timeout or manual stop button
5. **Very long responses**: Handle gracefully, maybe show token count

### Phase 10: Optional Enhancements

1. **Chat history persistence**: Save to localStorage
2. **Export chat**: Copy full conversation to clipboard
3. **Clear chat**: New button to reset conversation
4. **System prompt presets**: Dropdown of common system prompts
5. **Streaming indicator**: Visual feedback during token generation
6. **Token count**: Show tokens per message/total

## Testing Checklist

- [ ] Mode toggle switches UI correctly
- [ ] Context mode works unchanged
- [ ] Chat mode displays messages correctly
- [ ] User message triggers auto-inference
- [ ] Auto-inference stops at `<|end_of_text|>`
- [ ] Multiple turns work in conversation
- [ ] Switching modes syncs state correctly
- [ ] System prompt is editable
- [ ] System preset dropdown changes system prompt
- [ ] Send button disables during generation
- [ ] Enter key sends message (Shift+Enter for newline)
- [ ] Beam view works in Chat mode
- [ ] Temperature/Top-K/Top-P controls work in Chat mode

## Resolved Questions

1. **Beam view in Chat mode**: Enable beam search on the full chat context (system + messages). The beam paths will show possible continuations for the next assistant response.

2. **Starter texts in Chat mode**: Replace the starter dropdown with a "System Preset" dropdown containing different system prompts:
   - Standard assistant
   - Rhyming assistant
   - Creative writing partner
   - Code helper
   - Concise responder
   - etc.

3. **Chat history persistence**: In-memory only for now. localStorage can be added later.

4. **System prompt format**: Use the agreed format:
   ```
   SYSTEM INSTRUCTION: You are a helpful, accurate assistant that responds clearly and concisely. End your response with:<|end_of_text|>
   ```

5. **Missing stop token**: If model doesn't generate `<|end_of_text|>`, user can manually stop auto-inference with the stop button (▶ → ■).

## File Change Summary

| File | Lines Changed | Description |
|------|--------------|-------------|
| `app/static/index.html` | ~50 | Add mode toggle, chat UI structure |
| `app/static/style.css` | ~150 | Add chat mode styles |
| `app/static/app.js` | ~200 | Add chat state, handlers, modify inference |

**Total Estimated Changes**: ~400 lines
