// ═══════════════════════════════════════════════════════════════════════
// Laura's Food — AI Edge Function (OpenAI GPT-4o)
//
// Proxies OpenAI Chat Completions so the API key stays server-side.
// Two actions:
//   - photo_to_pantry  (vision)  : photo -> [{name, qty, unit, emoji, is_staple}]
//   - create_meal      (text)    : pantry + profile + history -> recipe JSON
//
// Deploy:
//   supabase login
//   supabase link --project-ref qdhqkcsfslkbhxtogjfp
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase functions deploy ai --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════════

const OPENAI_MODEL  = 'gpt-4o';        // vision-capable, great at JSON
const OPENAI_API    = 'https://api.openai.com/v1/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callOpenAI(messages: any[], opts: { maxTokens?: number; jsonMode?: boolean } = {}) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in secrets');

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 2500,
    temperature: 0.7,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

// Best-effort JSON extraction (model may wrap in code fences or prose
// when not in json_mode, e.g. when returning a top-level array).
function extractJSON(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch {}

  const startO = candidate.indexOf('{');
  const startA = candidate.indexOf('[');
  const head = (startA !== -1 && (startO === -1 || startA < startO)) ? startA : startO;
  if (head === -1) throw new Error('No JSON found in response');
  const closer = candidate[head] === '[' ? ']' : '}';
  const tail = candidate.lastIndexOf(closer);
  return JSON.parse(candidate.slice(head, tail + 1));
}

// ─── Action: photo_to_pantry ──────────────────────────────────────────
async function actionPhotoToPantry(payload: any) {
  const { image_base64, image_type } = payload;
  if (!image_base64) throw new Error('Missing image_base64');

  const dataUrl = `data:${image_type || 'image/jpeg'};base64,${image_base64}`;

  const text = await callOpenAI([
    {
      role: 'system',
      content: 'You are a vision assistant that catalogs food and grocery items in photos. You ALWAYS respond with valid JSON only — no prose, no markdown.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: dataUrl, detail: 'high' }
        },
        {
          type: 'text',
          text: `Identify each distinct food / grocery item in this photo and return JSON in this exact shape:

{
  "items": [
    {
      "name": "Cherry tomatoes",
      "qty": 1,
      "unit": "pint",
      "emoji": "🍅",
      "is_staple": false
    }
  ]
}

Rules:
- name: short descriptive (e.g. "Cherry tomatoes", "Avocados")
- qty: integer count visible (default 1)
- unit: short unit ("pc", "bag", "container", "bunch", "pint", "can", "bottle", etc.)
- emoji: single emoji for the item
- is_staple: TRUE only for non-perishable shelf items (oils, vinegars, spices, canned goods, condiments, sauces). FALSE for fresh produce, meats, dairy, eggs.

Return ONLY the JSON object. No explanation.`
        }
      ]
    }
  ], { jsonMode: true, maxTokens: 1500 });

  const parsed = extractJSON(text);
  // Accept either {items: [...]} or a bare array, just to be safe
  return Array.isArray(parsed) ? parsed : (parsed.items ?? []);
}

// ─── Action: create_meal ──────────────────────────────────────────────
async function actionCreateMeal(payload: any) {
  const { pantry, profile, meals_history, people, ages, notes } = payload;

  const pantryList = (pantry || []).map((p: any) =>
    `- ${p.name} (${p.qty} ${p.unit || ''})${p.is_staple ? ' [staple]' : ''}${p.expires ? ' [expires '+p.expires+']' : ''}`
  ).join('\n');

  const historyList = Object.entries(meals_history || {})
    .map(([wk, m]) => `${wk}: ${(m as string[]).join(', ')}`)
    .join('\n') || '(none yet)';

  const userPrompt = `LAURA'S PROFILE:
- Goal: ${profile.goal}
- Loves: ${profile.loves.join(', ')}
- Avoid: ${profile.avoid.join(', ')}
- Primary proteins: ${profile.proteins.join(', ')}
- Max prep: ${profile.max_prep_minutes} minutes
- Presentation: ${profile.presentation}

CURRENT PANTRY:
${pantryList}

MEALS ALREADY EATEN (never repeat):
${historyList}

REQUEST:
- People: ${people}
- Ages: ${ages || 'not specified'}
- Notes: ${notes || 'none'}

RULES:
1. Tomatoes must be a prominent ingredient.
2. Use ONLY items currently in the pantry (basic salt/pepper assumed).
3. Max ${profile.max_prep_minutes} minutes total.
4. Restaurant-quality presentation — looks beautiful on the plate.
5. Scale all quantities to ${people} ${people === 1 ? 'person' : 'people'}.
6. Do NOT repeat any meal in the history.

Return JSON in this EXACT shape:
{
  "name": "Meal name",
  "emoji": "🍽",
  "time": "10 min",
  "cook": "No cook" | "Pan sear" | "Boil eggs ahead" | "Quick",
  "protein": "main protein",
  "ingredients": ["item — qty", "..."],
  "steps": ["step 1", "step 2"],
  "dressing": "dressing recipe",
  "plating": "plating tip"
}`;

  const text = await callOpenAI([
    {
      role: 'system',
      content: "You are Laura's personal chef. You create one bistro-quality meal at a time using only what's in her pantry. You ALWAYS respond with valid JSON only."
    },
    { role: 'user', content: userPrompt }
  ], { jsonMode: true, maxTokens: 2500 });

  return extractJSON(text);
}

// ─── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = await req.json();
    const { action, ...payload } = body;
    let result;

    if (action === 'photo_to_pantry')      result = await actionPhotoToPantry(payload);
    else if (action === 'create_meal')     result = await actionCreateMeal(payload);
    else return json({ error: `Unknown action: ${action}` }, 400);

    return json({ result });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
