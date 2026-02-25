export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { conversation_id, user } = req.query;

  if (!conversation_id) {
    res.status(400).json({ error: 'conversation_id is required' });
    return;
  }

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DIFY_API_KEY is not configured' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.dify.ai/v1/messages?conversation_id=${encodeURIComponent(conversation_id)}&user=${encodeURIComponent(user || 'anonymous')}&limit=50`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: text });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Dify messages error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
}
