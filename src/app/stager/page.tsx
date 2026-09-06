import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * /stager root — redirects to login if no stager_token cookie.
 * The middleware handles this too but this server page is a fallback.
 */
export default async function StagerRootPage() {
  const cookieStore = await cookies();
  const stagerToken = cookieStore.get("stager_token")?.value;

  if (!stagerToken) {
    redirect("/login/stager");
  }

  // If they have a token, we don't know which tournament — send them to login
  // so they can re-enter their code.
  redirect("/login/stager");
}
