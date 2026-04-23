-- ═══════════════════════════════════════════════════════════════════════
-- Laura's Food — AI Proxy via Postgres
-- Allows the browser to call OpenAI without exposing the API key.
-- The key lives in app_private.secrets, only readable by the SECURITY
-- DEFINER function ai_call(), which validates and proxies the request.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. http extension for outbound HTTPS calls
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. Private schema + secrets table (NOT exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL  ON SCHEMA app_private FROM anon, authenticated, public;

CREATE TABLE IF NOT EXISTS app_private.secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

REVOKE ALL ON TABLE app_private.secrets FROM anon, authenticated, public;

-- 3. The AI proxy function
DROP FUNCTION IF EXISTS public.ai_call(JSONB);

CREATE OR REPLACE FUNCTION public.ai_call(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, app_private
AS $$
DECLARE
  api_key       TEXT;
  request_model TEXT;
  request_max   INT;
  response      RECORD;
BEGIN
  -- Get API key from private secrets
  SELECT value INTO api_key FROM app_private.secrets WHERE key = 'openai_api_key';
  IF api_key IS NULL OR api_key = '' THEN
    RETURN jsonb_build_object('error', 'openai_api_key not configured');
  END IF;

  -- Validate request: only allowed models, sane token limits
  request_model := payload->>'model';
  IF request_model NOT IN ('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo') THEN
    RETURN jsonb_build_object('error', 'model not allowed: ' || COALESCE(request_model, 'null'));
  END IF;

  request_max := COALESCE((payload->>'max_tokens')::int, 1000);
  IF request_max > 4000 THEN
    RETURN jsonb_build_object('error', 'max_tokens too high (cap=4000)');
  END IF;

  -- Forward to OpenAI Chat Completions
  SELECT * INTO response
  FROM extensions.http((
    'POST',
    'https://api.openai.com/v1/chat/completions',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || api_key)
    ],
    'application/json',
    payload::text
  )::extensions.http_request);

  IF response.status >= 400 THEN
    RETURN jsonb_build_object(
      'error', 'OpenAI HTTP ' || response.status,
      'detail', response.content::jsonb
    );
  END IF;

  RETURN response.content::jsonb;
END;
$$;

-- 4. Grant execute to the publishable (anon) role + authenticated
GRANT EXECUTE ON FUNCTION public.ai_call(JSONB) TO anon, authenticated;

-- 5. Set a safer http timeout for the request (default is too low for vision)
ALTER ROLE anon         SET statement_timeout = '60s';
ALTER ROLE authenticated SET statement_timeout = '60s';

SELECT 'AI setup complete ✓' AS status;
