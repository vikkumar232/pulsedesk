import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 10000;
const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '32kb' }));

app.get('/', (_request, response) => {
  response.redirect('https://vikkumar232.github.io/pulsedesk/');
});

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'pulsedesk-api' });
});

app.post('/api/gemini', async (request, response) => {
  const { question, context } = request.body || {};
  if (!question || typeof question !== 'string') {
    return response.status(400).json({ error: 'A question is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured on the server.' });

  const prompt = `You are Pulse AI, an assistant for a trained emergency dispatcher. Use the incident context below to answer the dispatcher. Give concise, calm, practical suggestions. Never claim certainty, never contact emergency services, and always tell the operator to verify critical details. Do not replace trained professional judgment.\n\nIncident context:\n${context || 'No incident context provided.'}\n\nDispatcher question:\n${question}`;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
      },
    );

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) return response.status(geminiResponse.status).json({ error: data?.error?.message || 'Gemini request failed.' });
    return response.json({ answer: data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer was returned.' });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
});

app.listen(port, () => console.log(`PulseDesk API listening on port ${port}`));
