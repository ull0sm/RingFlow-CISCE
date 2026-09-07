import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ─── Organiser routes: cookie-only auth, zero network calls in middleware ────
  // Real session validation happens in ensureOrganiserHasAccessToTournament()
  // inside each server action / page, which runs on the server with full DB access.
  if (pathname.startsWith('/organiser')) {
    const isWaitingRoom = pathname.startsWith('/organiser/waiting')
    const orgToken = request.cookies.get('org_token')?.value

    if (!isWaitingRoom && !orgToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/login/organiser'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request })
  }

  // ─── Stager routes: cookie-only auth, zero network calls in middleware ────
  // Real session validation happens in ensureStagerHasAccessToTournament()
  if (pathname.startsWith('/stager')) {
    const isWaitingRoom = pathname.startsWith('/stager/waiting')
    const stagerToken = request.cookies.get('stager_token')?.value

    if (!isWaitingRoom && !stagerToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/login/stager'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request })
  }

  // ─── Moderator routes: cookie-only auth, zero network calls in middleware ────
  // Real session validation happens in validateModeratorSession() in each action.
  if (pathname.startsWith('/moderator')) {
    const isWaitingRoom = pathname.startsWith('/moderator/waiting')
    const modToken = request.cookies.get('mod_token')?.value

    if (!isWaitingRoom && !modToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/login/mod'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request })
  }

  // ─── Admin routes: Supabase Auth JWT verification required ────────────────
  // Only admin routes need the full getUser() call because they authenticate
  // via Supabase Auth (email/password), not custom cookies.
  if (pathname.startsWith('/admin')) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // getUser() does a network call to verify the JWT with Supabase Auth.
    // Necessary here to prevent tampering with the session cookie on admin routes.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login/admin'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  }

  // ─── All other routes: pass through with no network calls ─────────────────
  return NextResponse.next({ request })
}
