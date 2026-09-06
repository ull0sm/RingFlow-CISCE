-- 1. Create organisers table if it doesn't already exist
CREATE TABLE IF NOT EXISTS public.organisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Fast case-insensitive lookup index
CREATE INDEX IF NOT EXISTS idx_organisers_email ON public.organisers (lower(email));

-- 3. Enable RLS
ALTER TABLE public.organisers ENABLE ROW LEVEL SECURITY;

-- 4. Idempotent policies: Organisers can read own profile & tournaments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'organisers' AND policyname = 'Organisers can view own record'
    ) THEN
        CREATE POLICY "Organisers can view own record" ON public.organisers 
        FOR SELECT TO authenticated 
        USING (lower(email) = lower(auth.jwt()->>'email'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournaments' AND policyname = 'Organisers can view all tournaments'
    ) THEN
        CREATE POLICY "Organisers can view all tournaments" ON public.tournaments 
        FOR SELECT TO authenticated 
        USING (
            EXISTS (
                SELECT 1 FROM public.organisers o 
                WHERE lower(o.email) = lower(auth.jwt()->>'email')
            )
        );
    END IF;
END $$;
