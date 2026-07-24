# Archived edge functions (2026-07-24)

Growth/marketing functions retired from the deployable set per the goal-loop
item-2 audit (STATE.md → "Scope — archive candidates"): all depended on the
Lovable AI gateway (`ai.gateway.lovable.dev` + `LOVABLE_API_KEY`), which the
platform no longer uses — Isabella core runs on the Anthropic API.

They are parked here, NOT deleted, so reinstating one is a `git mv` back plus
a migration of its gateway call to `_shared/anthropic.ts`.

| Function | Was invoked from |
|---|---|
| facebook-publish | MediaManagerPage publish flow |
| generate-ai-image | MediaManagerPage "Generate AI Image" |
| generate-slot-content | Media strategy Planner/Review |
| media-draft | MediaManagerPage Research/Draft/Workflow |
| outreach-enrich-lead | AIOutreachPage control panel |
| outreach-generate-drafts | AIOutreachPage control panel + lead dialog |
| outreach-topic-insights | Media strategy Topics insights card |
| rate-outreach-leads | AIOutreachPage leads tab + control panel |
| repurpose-content | MediaManagerPage Published → Repurpose |
| outreach-pipeline-runner | AIOutreachPage "Run Full Pipeline" (no Lovable call itself, but only orchestrates the three archived outreach fns) |

Nothing in `supabase/functions/` or `src/` may reference these
(`lovableDebris.test.ts` + `archivedFunctions.test.ts` enforce it).
Deployed instances on prod are inert once their UI entry points are gone;
delete them from the dashboard at the next housekeeping pass.
