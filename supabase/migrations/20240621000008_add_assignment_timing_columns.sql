BEGIN;

-- Safe, non-blocking additions of timing columns to category_assignments
ALTER TABLE public.category_assignments
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER NOT NULL DEFAULT 0;

-- Backfill started_at for already-started categories using event_log if available
DO $$
BEGIN
  UPDATE public.category_assignments ca
  SET started_at = el.created_at
  FROM (
    SELECT category_id, MIN(created_at) as created_at
    FROM public.event_log
    WHERE action = 'START_CATEGORY'
    GROUP BY category_id
  ) el
  WHERE ca.category_id = el.category_id
  AND ca.started_at IS NULL;
END $$;

COMMIT;
