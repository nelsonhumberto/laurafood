-- ============================================================
-- Laura's Food — Supabase Setup
-- Run this ONCE in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qdhqkcsfslkbhxtogjfp/editor
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.app_state (
  id          TEXT PRIMARY KEY DEFAULT 'laura',
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

-- 3. Allow anyone with the publishable key to read and write
--    (single-user app — Laura only)
DROP POLICY IF EXISTS allow_all ON public.app_state;
CREATE POLICY allow_all ON public.app_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Enable real-time so changes sync instantly across devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;

-- 5. Insert the initial empty row (the app will populate it on first save)
INSERT INTO public.app_state (id, data)
VALUES ('laura', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Done! Open the app and it will sync automatically.
SELECT 'Setup complete ✓' AS status;
