import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh auth session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect Admin routes
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/admin')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login/admin'
    return NextResponse.redirect(url)
  }

  // Protect Organiser routes
  if (request.nextUrl.pathname.startsWith('/organiser')) {
    const isWaitingRoom = request.nextUrl.pathname.startsWith('/organiser/waiting');
    const orgToken = request.cookies.get('org_token')?.value;

    // Allow waiting room without token, or allow if admin user or valid orgToken
    if (!isWaitingRoom && !user && !orgToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/login/organiser';
      return NextResponse.redirect(url);
    }
  }

  // Protect Stager routes
  if (request.nextUrl.pathname.startsWith('/stager')) {
    const isWaitingRoom = request.nextUrl.pathname.startsWith('/stager/waiting');
    const stagerToken = request.cookies.get('stager_token')?.value;

    if (!isWaitingRoom && !user && !stagerToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/login/stager';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse
}
