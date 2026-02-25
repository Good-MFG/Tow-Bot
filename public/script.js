const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

const _urlParams = new URLSearchParams(window.location.search);
let conversationId = _urlParams.get('cid') || null;
let isStreaming = false;

function renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Line breaks (double newline = paragraph, single = <br>)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return '<p>' + html + '</p>';
}

function getUserId() {
  return _urlParams.get('uid') || 'anonymous';
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

  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

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

    let fullText = '';
    let loadingCleared = false;

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
            window.parent.postMessage({ type: 'TOW_BOT_SESSION', conversationId }, '*');
          }

          if (data.answer !== undefined) {
            if (!loadingCleared) {
              loadingBubble.innerHTML = '';
              loadingCleared = true;
            }
            fullText += data.answer;
            loadingBubble.innerHTML = renderMarkdown(fullText);
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
            window.parent.postMessage({ type: 'TOW_BOT_SESSION', conversationId }, '*');
          }
          if (data.answer !== undefined) {
            if (!loadingCleared) {
              loadingBubble.innerHTML = '';
              loadingCleared = true;
            }
            fullText += data.answer;
            loadingBubble.innerHTML = renderMarkdown(fullText);
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

function newConversation() {
  if (isStreaming) return;

  // Reset conversation state
  conversationId = null;

  // Tell the parent page to clear the stored conversation ID
  window.parent.postMessage({ type: 'TOW_BOT_NEW_CONVERSATION' }, '*');

  // Clear messages and restore welcome screen
  messagesEl.innerHTML = `
    <div id="welcome">
      <img class="welcome-logo" src="Tow-Bot-logo.jpg" alt="Tow Bot">
      <h2>Welcome to Tow Bot</h2>
      <p>Ask me anything about Good MFG products and services.</p>
    </div>`;

  input.value = '';
  input.focus();
}

document.getElementById('new-chat-btn').addEventListener('click', newConversation);

async function loadHistory() {
  const cid = _urlParams.get('cid');
  if (!cid) return;

  try {
    const res = await fetch(
      `/api/messages?conversation_id=${encodeURIComponent(cid)}&user=${encodeURIComponent(getUserId())}`
    );
    if (!res.ok) return;

    const data = await res.json();
    if (!data.data || !data.data.length) return;

    // Remove welcome screen
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.remove();

    // Dify returns newest-first; reverse for chronological display
    const messages = data.data.slice().reverse();
    for (const msg of messages) {
      if (msg.query) addMessage(msg.query, 'user');
      if (msg.answer) {
        const div = addMessage('', 'ai');
        div.innerHTML = renderMarkdown(msg.answer);
      }
    }
    scrollToBottom();
  } catch (err) {
    // History load is non-critical — fail silently
  }
}

loadHistory();
