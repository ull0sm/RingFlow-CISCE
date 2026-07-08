BEGIN;

-- Alter Athletes Table to add new school and tracking columns
ALTER TABLE public.athletes ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE public.athletes ADD COLUMN IF NOT EXISTS school_code TEXT;
ALTER TABLE public.athletes ADD COLUMN IF NOT EXISTS sports_id TEXT;

COMMIT;
