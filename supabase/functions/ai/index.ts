// ═══════════════════════════════════════════════════════════════════════
// Laura's Food — AI Edge Function
// Proxies Anthropic Claude API calls so the API key stays server-side.
//
// Deploy:
//   supabase login
//   supabase link --project-ref qdhqkcsfslkbhxtogjfp
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════════

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

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

async function callClaude(messages: any[], maxTokens = 2000) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in secrets');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// Best-effort JSON extraction (Claude may wrap in code fences or prose)
function extractJSON(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch {}

  // Try first { ... } block
  const start = candidate.indexOf('{');
  const startA = candidate.indexOf('[');
  const head = (startA !== -1 && (start === -1 || startA < start)) ? startA : start;
  if (head === -1) throw new Error('No JSON found in response');
  const tail = candidate.lastIndexOf(head === startA ? ']' : '}');
  return JSON.parse(candidate.slice(head, tail + 1));
}

// ─── Action: photo_to_pantry ──────────────────────────────────────────
async function actionPhotoToPantry(payload: any) {
  const { image_base64, image_type } = payload;
  if (!image_base64) throw new Error('Missing image_base64');

  const text = await callClaude([{
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: image_type || 'image/jpeg',
          data: image_base64,
        },
      },
      {
        type: 'text',
        text: `You are looking at a photo of food/grocery items. Identify each distinct item visible in the image and return ONLY a valid JSON array — no prose, no markdown.

For each item include:
- name: short descriptive name (e.g. "Cherry tomatoes")
- qty: integer count visible (default 1)
- unit: short unit string ("pc", "bag", "container", "bunch", "pint", etc.)
- emoji: a single emoji for the item
- is_staple: true ONLY for non-perishable shelf items (oils, vinegars, spices, canned goods, condiments). false for fresh produce, meats, dairy.

Example output:
[
  {"name":"Cherry tomatoes","qty":1,"unit":"pint","emoji":"🍅","is_staple":false},
  {"name":"Avocados","qty":3,"unit":"pc","emoji":"🥑","is_staple":false}
]

Return ONLY the JSON array — no explanation.`
      }
    ]
  }], 1500);

  return extractJSON(text);
}

// ─── Action: create_meal ──────────────────────────────────────────────
async function actionCreateMeal(payload: any) {
  const { pantry, profile, meals_history, people, ages, notes } = payload;
  const pantryList = (pantry || []).map((p: any) =>
    `- ${p.name} (${p.qty} ${p.unit || ''})${p.is_staple ? ' [staple]' : ''}${p.expires ? ' [expires '+p.expires+']' : ''}`
  ).join('\n');
  const historyList = Object.entries(meals_history || {})
    .map(([wk, m]) => `${wk}: ${(m as string[]).join(', ')}`).join('\n') || '(none yet)';

  const prompt = `You are Laura's personal meal planner. Generate ONE recipe right now using items from her pantry.

LAURA'S PROFILE:
- Goal: ${profile.goal}
- Loves: ${profile.loves.join(', ')}
- Avoid: ${profile.avoid.join(', ')}
- Primary proteins: ${profile.proteins.join(', ')}
- Max prep: ${profile.max_prep_minutes} minutes
- Presentation: ${profile.presentation}

CURRENT PANTRY:
${pantryList}

MEALS ALREADY EATEN — never repeat:
${historyList}

REQUEST:
- People: ${people}
- Ages: ${ages || 'not specified'}
- Notes: ${notes || 'none'}

RULES:
1. Tomatoes must be a prominent ingredient
2. Use ONLY items currently in the pantry (or assume basic salt/pepper)
3. Max ${profile.max_prep_minutes} minutes prep
4. Restaurant-quality presentation
5. Scale quantities to ${people} ${people === 1 ? 'person' : 'people'}
6. Do NOT repeat any meal in the history

Return ONLY a valid JSON object — no prose, no markdown:
{
  "name": "Meal name",
  "emoji": "🍽",
  "time": "10 min",
  "cook": "No cook" | "Pan sear" | "Boil eggs ahead",
  "protein": "main protein",
  "ingredients": ["item — qty", ...],
  "steps": ["step 1", "step 2", ...],
  "dressing": "dressing recipe",
  "plating": "plating tip"
}`;

  const text = await callClaude([{ role: 'user', content: prompt }], 2500);
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

    if (action === 'photo_to_pantry') result = await actionPhotoToPantry(payload);
    else if (action === 'create_meal') result = await actionCreateMeal(payload);
    else return json({ error: `Unknown action: ${action}` }, 400);

    return json({ result });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
