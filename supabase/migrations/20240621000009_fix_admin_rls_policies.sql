-- Fix RLS policies to allow authenticated admins or server-actions to update/manage rings, mod requests, categories, etc.
BEGIN;

-- 1. Ring Timer Columns (Safe, non-blocking additions for synced Tatami timers)
ALTER TABLE public.rings
ADD COLUMN IF NOT EXISTS timer_status TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_accumulated_seconds INTEGER NOT NULL DEFAULT 0;

-- 2. Moderator Requests: allow updates (approving/rejecting/revoking)
DROP POLICY IF EXISTS "Admins can manage mod requests" ON public.moderator_requests;
DROP POLICY IF EXISTS "Public can update mod requests" ON public.moderator_requests;
DROP POLICY IF EXISTS "Public can manage mod requests" ON public.moderator_requests;
CREATE POLICY "Public can manage mod requests" ON public.moderator_requests FOR ALL USING (true) WITH CHECK (true);

-- 3. Rings: allow managing rings (insert, update, delete)
DROP POLICY IF EXISTS "Admins can manage rings" ON public.rings;
DROP POLICY IF EXISTS "Public can manage rings" ON public.rings;
CREATE POLICY "Public can manage rings" ON public.rings FOR ALL USING (true) WITH CHECK (true);

-- 4. Categories: allow managing categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public can manage categories" ON public.categories;
CREATE POLICY "Public can manage categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- 5. Tournaments: allow managing tournaments
DROP POLICY IF EXISTS "Admins can manage their tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Public can manage tournaments" ON public.tournaments;
CREATE POLICY "Public can manage tournaments" ON public.tournaments FOR ALL USING (true) WITH CHECK (true);

-- 6. Category Assignments: allow managing assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.category_assignments;
DROP POLICY IF EXISTS "Public can manage assignments" ON public.category_assignments;
CREATE POLICY "Public can manage assignments" ON public.category_assignments FOR ALL USING (true) WITH CHECK (true);

-- 7. Admins: allow viewing and auto-registration
DROP POLICY IF EXISTS "Admins can view own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can insert own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can update own record" ON public.admins;
DROP POLICY IF EXISTS "Public can manage admins" ON public.admins;
CREATE POLICY "Public can manage admins" ON public.admins FOR ALL USING (true) WITH CHECK (true);

-- 8. Ensure rings table is in realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'rings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rings;
  END IF;
END $$;

COMMIT;
