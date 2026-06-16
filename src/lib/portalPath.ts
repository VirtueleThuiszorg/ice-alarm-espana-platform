/**
 * Resolve the portal base path for shared pages (e.g. TasksPage is re-exported by both
 * /admin and /call-centre). Member/detail links must stay inside the portal the user is
 * actually in, instead of hardcoding /admin.
 */
export function memberBasePathFor(pathname: string): "/admin" | "/call-centre" {
  return pathname.startsWith("/call-centre") ? "/call-centre" : "/admin";
}
