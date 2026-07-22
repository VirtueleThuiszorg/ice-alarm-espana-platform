import { Outlet } from "react-router-dom";

/**
 * Stage 4b — scopes the warm "v"-mark public theme (see `.theme-public` in
 * src/index.css) to the public marketing / join / auth route group only, so the
 * admin, call-centre and client-dashboard surfaces keep the legacy tokens.
 * A thin pass-through layout: it adds the theme class and renders the matched
 * public route via <Outlet>, changing nothing about routing or page structure.
 */
export function PublicThemeLayout() {
  return (
    <div className="theme-public min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
