const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

let conversationId = null;
let isStreaming = false;

function getUserId() {
  let id = sessionStorage.getItem('chat_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('chat_user_id', id);
  }
  return id;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(text, role) {
  const div = document.createElement('div');
  div.classList.add('message', role);
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function addLoadingBubble() {
  const div = document.createElement('div');
  div.classList.add('message', 'ai');
  div.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function setInputEnabled(enabled) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
  isStreaming = !enabled;
}

async function sendMessage(query) {
  if (!query.trim() || isStreaming) return;

  addMessage(query, 'user');
  input.value = '';
  setInputEnabled(false);

  const loadingBubble = addLoadingBubble();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        conversation_id: conversationId,
        user: getUserId(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      loadingBubble.textContent = 'Error: ' + (err.error || 'Something went wrong');
      setInputEnabled(true);
      return;
    }

    // Replace loading bubble with empty AI message
    loadingBubble.innerHTML = '';
    let fullText = '';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.conversation_id && !conversationId) {
            conversationId = data.conversation_id;
          }

          if (data.answer !== undefined) {
            fullText += data.answer;
            loadingBubble.textContent = fullText;
            scrollToBottom();
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Process any remaining buffer
    if (buffer.startsWith('data: ')) {
      const jsonStr = buffer.slice(6).trim();
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr);
          if (data.conversation_id && !conversationId) {
            conversationId = data.conversation_id;
          }
          if (data.answer !== undefined) {
            fullText += data.answer;
            loadingBubble.textContent = fullText;
            scrollToBottom();
          }
        } catch {
          // Skip
        }
      }
    }

    if (!fullText) {
      loadingBubble.textContent = 'No response received.';
    }
  } catch (err) {
    console.error('Chat error:', err);
    loadingBubble.textContent = 'Error: Could not connect to server.';
  }

  setInputEnabled(true);
  input.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value);
});
