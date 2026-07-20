import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 10000;
const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(process.cwd()));

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'pulsedesk-api' });
});

async function callGemini(prompt, apiKey, temperature = 0.2, maxOutputTokens = 350) {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      }),
    },
  );
  const data = await geminiResponse.json();
  if (!geminiResponse.ok) throw new Error(data?.error?.message || 'Gemini request failed.');
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer was returned.';
}

function oneSentence(text) {
  const cleaned = String(text).replace(/^[\s>*-]+/, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : cleaned).trim() || 'Please verify the critical incident details with the caller.';
}

app.post('/api/gemini', async (request, response) => {
  const { question, context } = request.body || {};
  if (!question || typeof question !== 'string') {
    return response.status(400).json({ error: 'A question is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured on the server.' });

  try {
    const analystPrompt = `You are the Dispatch Analyst sub-agent. Draft a concise answer for a trained emergency dispatcher using the incident context below. Identify missing information and practical next questions. Do not make autonomous dispatch decisions, contact anyone, or claim certainty.\n\nIncident context:\n${context || 'No incident context provided.'}\n\nDispatcher question:\n${question}`;
    const draft = await callGemini(analystPrompt, apiKey, 0.2, 350);
    const reviewerPrompt = `You are the Safety Reviewer sub-agent. Review the analyst draft below before it is shown to a trained emergency dispatcher. Return exactly ONE sentence and nothing else. Keep it concise, calm, and practical. Remove unsupported claims, unsafe instructions, and autonomous decisions. Preserve the most useful next question and remind the operator to verify critical details.\n\nIncident context:\n${context || 'No incident context provided.'}\n\nDispatcher question:\n${question}\n\nAnalyst draft:\n${draft}`;
    const answer = oneSentence(await callGemini(reviewerPrompt, apiKey, 0.1, 150));
    return response.json({ answer, reviewed: true });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
});

app.listen(port, () => console.log(`PulseDesk API listening on port ${port}`));
