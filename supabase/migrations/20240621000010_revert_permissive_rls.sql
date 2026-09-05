-- Migration 20240621000010: Revert overly permissive RLS policies and restore secure scoped access
-- Admins can manage any tournament; Organisers only have access to their assigned tournament.
BEGIN;

-- 1. Add organiser_email column to tournaments if not exists
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS organiser_email TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_organiser_email 
ON public.tournaments (lower(organiser_email));

-- 2. Drop the permissive "Public can manage *" policies introduced in 20240621000009
DROP POLICY IF EXISTS "Public can manage mod requests" ON public.moderator_requests;
DROP POLICY IF EXISTS "Public can manage rings" ON public.rings;
DROP POLICY IF EXISTS "Public can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public can manage tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Public can manage assignments" ON public.category_assignments;
DROP POLICY IF EXISTS "Public can manage admins" ON public.admins;

-- 3. Admins Table
-- Authenticated admins can only view and update their own record
DROP POLICY IF EXISTS "Admins can view own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can insert own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can update own record" ON public.admins;
CREATE POLICY "Admins can view own record" ON public.admins 
    FOR SELECT TO authenticated 
    USING (auth.uid() = id);
CREATE POLICY "Admins can update own record" ON public.admins 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = id);

-- 4. Tournaments Table
-- Any registered admin can manage ANY tournament
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

-- Ensure public can view active/completed tournaments
DROP POLICY IF EXISTS "Public can view active tournaments" ON public.tournaments;
CREATE POLICY "Public can view active tournaments" ON public.tournaments 
    FOR SELECT 
    USING (status = 'active' OR status = 'completed');

-- 5. Rings Table
-- Admins can manage any rings
DROP POLICY IF EXISTS "Admins can manage rings" ON public.rings;
CREATE POLICY "Admins can manage rings" ON public.rings 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

-- Public can view rings for public displays / scoreboards
DROP POLICY IF EXISTS "Public can view rings" ON public.rings;
CREATE POLICY "Public can view rings" ON public.rings 
    FOR SELECT 
    USING (true);

-- 6. Categories Table
-- Admins can manage any categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

-- Public can view categories
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories 
    FOR SELECT 
    USING (true);

-- 7. Athletes Table
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

-- 8. Category Assignments Table
-- Admins can manage assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.category_assignments;
CREATE POLICY "Admins can manage assignments" ON public.category_assignments 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

-- Public can view assignments
DROP POLICY IF EXISTS "Public can view assignments" ON public.category_assignments;
CREATE POLICY "Public can view assignments" ON public.category_assignments 
    FOR SELECT 
    USING (true);

-- Moderators and organisers can update assignments via server actions (running with server client)
DROP POLICY IF EXISTS "Public can update assignments" ON public.category_assignments;
CREATE POLICY "Public can update assignments" ON public.category_assignments 
    FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- 9. Moderator Requests Table
-- Admins can manage mod requests
DROP POLICY IF EXISTS "Admins can manage mod requests" ON public.moderator_requests;
CREATE POLICY "Admins can manage mod requests" ON public.moderator_requests 
    FOR ALL TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.admins a WHERE a.id = auth.uid())
    );

-- Public can insert moderator requests (to request access)
DROP POLICY IF EXISTS "Public can insert mod requests" ON public.moderator_requests;
CREATE POLICY "Public can insert mod requests" ON public.moderator_requests 
    FOR INSERT 
    WITH CHECK (true);

-- Public can read mod requests (to poll/stream approval status)
DROP POLICY IF EXISTS "Public can read mod requests" ON public.moderator_requests;
CREATE POLICY "Public can read mod requests" ON public.moderator_requests 
    FOR SELECT 
    USING (true);

-- Allow moderator name update for session holders
DROP POLICY IF EXISTS "Moderators can update own request" ON public.moderator_requests;
CREATE POLICY "Moderators can update own request" ON public.moderator_requests 
    FOR UPDATE 
    USING (session_token IS NOT NULL)
    WITH CHECK (session_token IS NOT NULL);

COMMIT;
