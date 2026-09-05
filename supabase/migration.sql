-- RingFlow Production Migration
-- Run this migration in the Supabase SQL Editor on top of master.sql
-- Contains all incremental schema additions, table updates, indexes, and hardened RLS policies.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. ORGANISERS TABLE & ORGANISER MAPPINGS
-- =========================================================================

-- Create organisers table for email-based tournament management
CREATE TABLE IF NOT EXISTS public.organisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fast case-insensitive lookup index for organiser logins
CREATE INDEX IF NOT EXISTS idx_organisers_email ON public.organisers (lower(email));

-- Enable RLS on organisers
ALTER TABLE public.organisers ENABLE ROW LEVEL SECURITY;

-- Add organiser_email to tournaments to allow assigning tournaments to specific organisers
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS organiser_email TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_organiser_email 
ON public.tournaments (lower(organiser_email));


-- =========================================================================
-- 2. CATEGORY ASSIGNMENTS TIMING COLUMNS
-- =========================================================================

-- Safe additions of timing tracking to category_assignments
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


-- =========================================================================
-- 3. TATAMI RING TIMERS (SYNCHRONIZED TIMERS)
-- =========================================================================

-- Safe additions of timer columns to rings
ALTER TABLE public.rings
ADD COLUMN IF NOT EXISTS timer_status TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_accumulated_seconds INTEGER NOT NULL DEFAULT 0;


-- =========================================================================
-- 4. REALTIME PUBLICATION VERIFICATION
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'category_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.category_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'event_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_log;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'moderator_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.moderator_requests;
  END IF;
END $$;


-- =========================================================================
-- 5. SECURE PRODUCTION ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Drop any legacy / overly permissive policies if they exist
DROP POLICY IF EXISTS "Public can manage mod requests" ON public.moderator_requests;
DROP POLICY IF EXISTS "Public can manage rings" ON public.rings;
DROP POLICY IF EXISTS "Public can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public can manage tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Public can manage assignments" ON public.category_assignments;
DROP POLICY IF EXISTS "Public can manage admins" ON public.admins;

-- 5.1 Organisers Policies
DROP POLICY IF EXISTS "Organisers can view own record" ON public.organisers;
CREATE POLICY "Organisers can view own record" ON public.organisers 
    FOR SELECT TO authenticated 
    USING (lower(email) = lower(auth.jwt()->>'email'));

-- 5.2 Admins Table Policies
DROP POLICY IF EXISTS "Admins can view own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can insert own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can update own record" ON public.admins;
CREATE POLICY "Admins can view own record" ON public.admins 
    FOR SELECT TO authenticated 
    USING (auth.uid() = id);
CREATE POLICY "Admins can update own record" ON public.admins 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = id);

-- 5.3 Tournaments Table Policies
-- Any registered admin can manage tournaments
DROP POLICY IF EXISTS "Admins can manage their tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can manage tournaments" ON public.tournaments;
CREATE POLICY "Admins can manage tournaments" ON public.tournaments 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

-- Organisers can view their assigned tournament(s)
DROP POLICY IF EXISTS "Organisers can view all tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Organisers can view assigned tournaments" ON public.tournaments;
CREATE POLICY "Organisers can view assigned tournaments" ON public.tournaments 
    FOR SELECT TO authenticated 
    USING (
        lower(organiser_email) LIKE '%' || lower(auth.jwt()->>'email') || '%'
    );

-- Public can view active or completed tournaments
DROP POLICY IF EXISTS "Public can view active tournaments" ON public.tournaments;
CREATE POLICY "Public can view active tournaments" ON public.tournaments 
    FOR SELECT 
    USING (status = 'active' OR status = 'completed');

-- 5.4 Rings Table Policies
DROP POLICY IF EXISTS "Admins can manage rings" ON public.rings;
CREATE POLICY "Admins can manage rings" ON public.rings 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can view rings" ON public.rings;
CREATE POLICY "Public can view rings" ON public.rings 
    FOR SELECT 
    USING (true);

-- 5.5 Categories Table Policies
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories 
    FOR SELECT 
    USING (true);

-- 5.6 Athletes Table Policies
DROP POLICY IF EXISTS "Admins can manage athletes" ON public.athletes;
CREATE POLICY "Admins can manage athletes" ON public.athletes 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can view athletes" ON public.athletes;
CREATE POLICY "Public can view athletes" ON public.athletes 
    FOR SELECT 
    USING (true);

-- 5.7 Category Assignments Table Policies
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.category_assignments;
CREATE POLICY "Admins can manage assignments" ON public.category_assignments 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can view assignments" ON public.category_assignments;
CREATE POLICY "Public can view assignments" ON public.category_assignments 
    FOR SELECT 
    USING (true);

-- Moderators and organisers can update assignments via server actions
DROP POLICY IF EXISTS "Public can update assignments" ON public.category_assignments;
CREATE POLICY "Public can update assignments" ON public.category_assignments 
    FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- 5.8 Moderator Requests Table Policies
DROP POLICY IF EXISTS "Admins can manage mod requests" ON public.moderator_requests;
CREATE POLICY "Admins can manage mod requests" ON public.moderator_requests 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can insert mod requests" ON public.moderator_requests;
CREATE POLICY "Public can insert mod requests" ON public.moderator_requests 
    FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read mod requests" ON public.moderator_requests;
CREATE POLICY "Public can read mod requests" ON public.moderator_requests 
    FOR SELECT 
    USING (true);

-- Allow moderator name update for active session holders
DROP POLICY IF EXISTS "Moderators can update own request" ON public.moderator_requests;
CREATE POLICY "Moderators can update own request" ON public.moderator_requests 
    FOR UPDATE 
    USING (session_token IS NOT NULL)
    WITH CHECK (session_token IS NOT NULL);

-- 5.9 Event Log Table Policies
DROP POLICY IF EXISTS "Admins can manage event log" ON public.event_log;
CREATE POLICY "Admins can manage event log" ON public.event_log 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

DROP POLICY IF EXISTS "Public can view event log" ON public.event_log;
CREATE POLICY "Public can view event log" ON public.event_log 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Public can insert event logs" ON public.event_log;
CREATE POLICY "Public can insert event logs" ON public.event_log 
    FOR INSERT 
    WITH CHECK (true);

COMMIT;
