import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/admin'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') 
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    } else {
      console.error("Auth callback session exchange error:", error.message);
      const errorLoginPath = next.startsWith('/organiser') ? '/login/organiser' : '/login/admin';
      return NextResponse.redirect(`${origin}${errorLoginPath}?error=${encodeURIComponent(error.message)}`);
    }
  }

  // return the user to an error page with instructions
  const errorLoginPath = next.startsWith('/organiser') ? '/login/organiser' : '/login/admin';
  return NextResponse.redirect(`${origin}${errorLoginPath}?error=AuthFailed`);
}
