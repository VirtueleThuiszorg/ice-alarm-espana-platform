/**
 * Call-centre operator CRUD audit fixes — source contracts.
 *
 * 1. Tickets: the call-centre tickets surface must expose the full ticket
 *    lifecycle (create, comment, status change, assign/reassign, resolve,
 *    close). This is achieved by re-exporting the admin TicketsPage (one
 *    shared implementation, same idiom as call-centre/TasksPage), so the
 *    shared page must be portal-safe: member links go through
 *    memberBasePathFor, never a hardcoded /admin path.
 * 2. Shift notes: author-only edit + delete (with confirm) and a realtime
 *    subscription so other operators' notes appear without reload.
 * 3. Messages: unassigning a conversation must write NULL to the uuid
 *    column assigned_to — never an empty string (regression guard).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const ccTickets = read("src/pages/call-centre/TicketsPage.tsx");
const adminTickets = read("src/pages/admin/TicketsPage.tsx");
const shiftNotes = read("src/pages/call-centre/ShiftNotesPage.tsx");
const messages = read("src/pages/call-centre/MessagesPage.tsx");

describe("tickets — call-centre surface has full lifecycle CRUD", () => {
  it("call-centre TicketsPage re-exports the shared admin implementation", () => {
    expect(ccTickets).toContain('from "@/pages/admin/TicketsPage"');
    // No parallel duplicate implementation left behind.
    expect(ccTickets).not.toContain("supabase");
  });

  it("shared page can change status / assign / resolve / close (updateTicket)", () => {
    expect(adminTickets).toMatch(/const updateTicket = async \(field: string, value: string \| null\)/);
    // Status + assignment selects are wired to updateTicket.
    expect(adminTickets).toMatch(/updateTicket\("status", v\)/);
    expect(adminTickets).toMatch(/updateTicket\("assigned_to", v === "unassigned" \? null : v\)/);
    // Resolve/close stamps resolved_at.
    expect(adminTickets).toMatch(/value === "resolved" \|\| value === "closed"/);
    expect(adminTickets).toContain("updateData.resolved_at");
    // Explicit resolve affordance and the closed status option exist.
    expect(adminTickets).toMatch(/updateTicket\("status", "resolved"\)/);
    expect(adminTickets).toContain('<SelectItem value="closed">');
  });

  it("shared page keeps ticket creation (operators could create before)", () => {
    expect(adminTickets).toMatch(/const createTicket = async/);
    expect(adminTickets).toMatch(/\.from\("internal_tickets"\)\s*\.insert\(/);
  });

  it("shared page is portal-safe: member links use memberBasePathFor, no hardcoded /admin", () => {
    expect(adminTickets).toContain('import { memberBasePathFor } from "@/lib/portalPath"');
    expect(adminTickets).toContain("${memberBasePath}/members/");
    expect(adminTickets).not.toContain("/admin/members/");
  });
});

describe("shift notes — author-only edit/delete + realtime", () => {
  it("subscribes to shift_notes postgres_changes so other operators' notes appear live", () => {
    expect(shiftNotes).toMatch(/\.channel\("call-centre-shift-notes"\)/);
    expect(shiftNotes).toMatch(/table:\s*"shift_notes"/);
    expect(shiftNotes).toContain("supabase.removeChannel(channel)");
  });

  it("edit is author-only: guarded in the handler and scoped in the update query", () => {
    expect(shiftNotes).toMatch(/if \(!editingNote \|\| editingNote\.staffId !== currentStaffId\) return;/);
    expect(shiftNotes).toMatch(/\.update\(\{ note_content: editContent \}\)[\s\S]{0,120}\.eq\("staff_id", currentStaffId\)/);
  });

  it("delete is author-only and behind a confirm dialog", () => {
    expect(shiftNotes).toMatch(/if \(!noteToDelete \|\| noteToDelete\.staffId !== currentStaffId\) return;/);
    expect(shiftNotes).toMatch(/\.delete\(\)[\s\S]{0,120}\.eq\("staff_id", currentStaffId\)/);
    expect(shiftNotes).toContain("<AlertDialog");
    expect(shiftNotes).toMatch(/AlertDialogAction[\s\S]{0,200}onClick=\{handleDeleteNote\}/);
  });

  it("edit/delete affordances only render for the note's author", () => {
    expect(shiftNotes).toMatch(/currentStaffId && note\.staffId === currentStaffId/);
  });

  it("existing add + follow-up toggle remain", () => {
    expect(shiftNotes).toMatch(/const handleAddNote = async/);
    expect(shiftNotes).toMatch(/const handleToggleFollowup = async/);
  });
});

describe("messages — unassign writes null, never an empty string (uuid column)", () => {
  it("unassign maps the sentinel to null", () => {
    expect(messages).toMatch(/updateConversation\("assigned_to", v === "unassigned" \? null : v\)/);
    expect(messages).toMatch(/const updateConversation = async \(field: string, value: string \| null\)/);
  });

  it('regression: no assigned_to: "" empty-string write anywhere in the page', () => {
    expect(messages).not.toMatch(/assigned_to[^\n]{0,80}\?\s*""/);
    expect(messages).not.toMatch(/assigned_to:\s*""/);
  });
});
