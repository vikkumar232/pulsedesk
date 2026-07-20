const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { question, context } = await request.json();
    if (!question || typeof question !== 'string') {
      return new Response(JSON.stringify({ error: 'A question is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

    const prompt = `You are Pulse AI, an assistant for a trained emergency dispatcher. Use the incident context below to answer the dispatcher. Give concise, calm, practical suggestions. Never claim certainty, never contact emergency services, and always tell the operator to verify critical details. Do not replace trained professional judgment.\n\nIncident context:\n${context || 'No incident context provided.'}\n\nDispatcher question:\n${question}`;

    const response = await fetch(
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

    const result = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: result?.error?.message || 'Gemini request failed.' }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const answer = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    return new Response(JSON.stringify({ answer: answer || 'No answer was returned.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
