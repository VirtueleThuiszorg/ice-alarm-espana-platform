import { describe, it, expect } from "vitest";
import { memberBasePathFor } from "@/lib/portalPath";

describe("memberBasePathFor — shared TasksPage member links stay in-portal", () => {
  it("returns /call-centre for call-centre routes", () => {
    expect(memberBasePathFor("/call-centre/tasks")).toBe("/call-centre");
    expect(memberBasePathFor("/call-centre")).toBe("/call-centre");
  });

  it("returns /admin for admin routes", () => {
    expect(memberBasePathFor("/admin/tasks")).toBe("/admin");
  });

  it("defaults to /admin for anything else", () => {
    expect(memberBasePathFor("/")).toBe("/admin");
    expect(memberBasePathFor("/dashboard/whatever")).toBe("/admin");
  });
});
