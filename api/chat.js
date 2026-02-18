export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { query, conversation_id, user } = req.body;

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DIFY_API_KEY is not configured' });
    return;
  }

  const body = {
    inputs: {},
    query,
    response_mode: 'streaming',
    user: user || 'anonymous',
  };

  if (conversation_id) {
    body.conversation_id = conversation_id;
  }

  try {
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: text });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error('Dify API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to connect to Dify API' });
    } else {
      res.end();
    }
  }
}
