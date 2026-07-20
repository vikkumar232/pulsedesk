import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 10000;
const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';
const MODEL = 'gemini-3.5-flash';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(process.cwd()));

const AGENT_NAMES = ['protocol', 'incident', 'safety', 'questions'];
const asString = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const asArray = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
const typed = (value, schema) => ({ ...schema, ...value });

const agentSchemas = {
  protocol: { agent: 'protocol', status: 'blocked', protocolId: null, protocolName: null, approvedSteps: [], source: null },
  incident: { agent: 'incident', status: 'ok', incidentType: 'unknown', location: null, hazards: [], people: null, injuries: null, confidence: 0 },
  safety: { agent: 'safety', status: 'ok', immediateRisks: [], safeQuestions: [], confidence: 0 },
  questions: { agent: 'questions', status: 'ok', questions: [], confidence: 0 },
};

function parseTyped(text, schema) {
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const result = typed(parsed, schema);
    result.agent = schema.agent;
    if (schema.agent === 'protocol') result.approvedSteps = asArray(result.approvedSteps);
    if (schema.agent === 'incident') { result.hazards = asArray(result.hazards); result.confidence = Number(result.confidence) || 0; }
    if (schema.agent === 'safety') { result.immediateRisks = asArray(result.immediateRisks); result.safeQuestions = asArray(result.safeQuestions); }
    if (schema.agent === 'questions') result.questions = asArray(result.questions);
    return result;
  } catch { return { ...schema, status: 'error' }; }
}

async function callGemini(prompt, apiKey, options = {}) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: options.temperature ?? 0.1, maxOutputTokens: options.maxOutputTokens ?? 350 } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Gemini request failed.');
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function protocolStore(context) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ...agentSchemas.protocol, status: 'blocked', source: 'Protocol store is not configured.' };
  const terms = encodeURIComponent((context || 'emergency dispatch').slice(0, 120));
  const response = await fetch(`${url}/rest/v1/protocols?select=id,name,topic,approved_steps,source_url&or=(topic.ilike.*${terms}*,name.ilike.*${terms}*)&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) return { ...agentSchemas.protocol, status: 'blocked', source: 'Protocol store query failed.' };
  const rows = await response.json();
  if (!rows.length) return { ...agentSchemas.protocol, status: 'blocked', source: 'No matching approved protocol found.' };
  const row = rows[0];
  return { agent: 'protocol', status: 'ok', protocolId: row.id, protocolName: row.name, approvedSteps: asArray(row.approved_steps), source: row.source_url || row.name };
}

function agentPrompts(context, protocol) {
  return {
    incident: `Return ONLY valid JSON matching this schema: {"agent":"incident","status":"ok","incidentType":"string","location":"string|null","hazards":["string"],"people":"string|null","injuries":"string|null","confidence":0}. Extract facts only; do not give protocol guidance. Context: ${context}`,
    safety: `Return ONLY valid JSON matching this schema: {"agent":"safety","status":"ok","immediateRisks":["string"],"safeQuestions":["string"],"confidence":0}. Identify risks and safe questions, but do not invent response procedures. Context: ${context}`,
    questions: `Return ONLY valid JSON matching this schema: {"agent":"questions","status":"ok","questions":["string"],"confidence":0}. Give only questions an operator can ask to clarify the incident; do not give procedural steps. Context: ${context}`,
    protocol: `Return ONLY valid JSON matching this schema: {"agent":"protocol","status":"ok|blocked","protocolId":"string|null","protocolName":"string|null","approvedSteps":["string"],"source":"string|null"}. Use only the approved protocol store result; never invent steps. Protocol store result: ${JSON.stringify(protocol)}`,
  };
}

function writeEvent(response, event, payload) { response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }
function oneSentence(text) {
  const cleaned = String(text).replace(/^[\s>*-]+/, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^.*?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : cleaned).trim();
  const lastWord = sentence.toLowerCase().replace(/[^a-z]+$/, '').split(' ').pop();
  const unfinishedWords = new Set(['a', 'an', 'and', 'because', 'for', 'from', 'if', 'in', 'is', 'of', 'or', 'the', 'to', 'with']);
  if (sentence.split(/\s+/).length < 7 || unfinishedWords.has(lastWord)) {
    return 'Verify the exact location, immediate safety risks, and applicable approved protocol before giving procedural guidance.';
  }
  return sentence.endsWith('.') || sentence.endsWith('!') || sentence.endsWith('?') ? sentence : `${sentence}.`;
}

async function orchestrate(question, context, apiKey, onEvent) {
  const protocol = await protocolStore(context);
  onEvent('agent', protocol);
  const prompts = agentPrompts(context, protocol);
  const independent = AGENT_NAMES.filter(name => name !== 'protocol').map(async name => {
    try {
      const result = parseTyped(await callGemini(prompts[name], apiKey, { maxOutputTokens: 260 }), agentSchemas[name]);
      onEvent('agent', result);
      return result;
    } catch { const result = { ...agentSchemas[name], status: 'error' }; onEvent('agent', result); return result; }
  });
  const [incident, safety, questions] = await Promise.all(independent);
  const synthesis = `You are the final Dispatch Reviewer. Return exactly ONE sentence and nothing else. Ground every procedural recommendation ONLY in approvedSteps from the protocol store; if protocol status is blocked or approvedSteps is empty, do not invent steps and instead say the operator must verify the applicable protocol. Use the facts and safe questions from the other agents. Be concise and operator-first.\n\nQuestion: ${question}\nIncident: ${JSON.stringify(incident)}\nSafety: ${JSON.stringify(safety)}\nQuestions: ${JSON.stringify(questions)}\nProtocol: ${JSON.stringify(protocol)}`;
  const answer = oneSentence(await callGemini(synthesis, apiKey, { temperature: 0.05, maxOutputTokens: 220 }));
  onEvent('final', { agent: 'reviewer', status: 'ok', answer, protocolGrounded: protocol.status === 'ok' && protocol.approvedSteps.length > 0 });
  return answer;
}

app.get('/health', (_request, response) => response.json({ ok: true, service: 'pulsedesk-api', agents: AGENT_NAMES }));

app.post('/api/gemini/stream', async (request, response) => {
  const { question, context } = request.body || {};
  const apiKey = process.env.GEMINI_API_KEY;
  if (!question || typeof question !== 'string') return response.status(400).json({ error: 'A question is required.' });
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured on the server.' });
  response.setHeader('Content-Type', 'text/event-stream'); response.setHeader('Cache-Control', 'no-cache'); response.setHeader('Connection', 'keep-alive'); response.flushHeaders?.();
  try { await orchestrate(question, context || 'No incident context provided.', apiKey, (event, payload) => writeEvent(response, event, payload)); } catch (error) { writeEvent(response, 'error', { message: error instanceof Error ? error.message : 'Pipeline failed.' }); }
  response.end();
});

app.post('/api/gemini', async (request, response) => {
  const { question, context } = request.body || {};
  const apiKey = process.env.GEMINI_API_KEY;
  if (!question || typeof question !== 'string') return response.status(400).json({ error: 'A question is required.' });
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured on the server.' });
  try { const answer = await orchestrate(question, context || 'No incident context provided.', apiKey, () => {}); return response.json({ answer, reviewed: true, orchestrated: true }); }
  catch (error) { return response.status(500).json({ error: error instanceof Error ? error.message : 'Pipeline failed.' }); }
});

app.listen(port, () => console.log(`PulseDesk orchestrator listening on port ${port}`));
