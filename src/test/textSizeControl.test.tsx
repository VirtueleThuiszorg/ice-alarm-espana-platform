/**
 * THE A/A TEXT-SIZE CONTROL — R10, and the WCAG "scalable fonts" line in GOALS §16.
 *
 * The load-bearing assertions are the ones about FAILURE and about the floor:
 *
 *   - a corrupt or unknown stored value must not be parsed into a size
 *   - `localStorage` throwing (Safari private mode) must not take the app down, in either
 *     direction, and must not lose the size for the current visit
 *   - the control can never make text SMALLER than R10's 16px floor. A product read mostly by
 *     people over seventy has no business offering that: it would be pressed once by accident
 *     and then be unreadable, including the control that would undo it
 *   - the size is applied BEFORE the first paint, from `main.tsx`. In an effect it renders at the
 *     default and jumps, which is the app appearing to ignore the choice once per visit
 *   - an arbitrary px font size on the member surface silently opts out of the whole feature, so
 *     there must not be one
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_STORAGE_KEY,
  BASE_FONT_PX,
  applyStoredTextSize,
  applyTextSize,
  parseTextSize,
  readStoredTextSize,
  textSizeSpec,
  writeStoredTextSize,
} from "@/lib/textSize";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

import { TextSizeControl } from "@/components/client/TextSizeControl";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.fontSize = "";
  delete document.documentElement.dataset.textSize;
});
afterEach(() => cleanup());

describe("the levels", () => {
  it("offers exactly two — R3 says A/A, not a slider", () => {
    expect(TEXT_SIZES.length).toBe(2);
  });

  it("has unique levels", () => {
    const levels = TEXT_SIZES.map((s) => s.level);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("NEVER goes below the 16px floor — no level shrinks the text", () => {
    for (const size of TEXT_SIZES) {
      expect(size.scale).toBeGreaterThanOrEqual(1);
      expect(BASE_FONT_PX * size.scale).toBeGreaterThanOrEqual(16);
    }
  });

  it("the default is a real level, and it is the unscaled one", () => {
    expect(() => textSizeSpec(DEFAULT_TEXT_SIZE)).not.toThrow();
    expect(textSizeSpec(DEFAULT_TEXT_SIZE).scale).toBe(1);
  });

  it("the larger level is actually larger", () => {
    const scales = TEXT_SIZES.map((s) => s.scale);
    expect(Math.max(...scales)).toBeGreaterThan(1);
  });

  it("each level has an accessible name — 'A' and 'A' are identical to a screen reader", () => {
    for (const size of TEXT_SIZES) {
      expect(size.label.fallback.length).toBeGreaterThan(1);
    }
    const names = TEXT_SIZES.map((s) => s.label.fallback);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("parsing and storage — everything here can be wrong", () => {
  it("an unknown stored value is the default, not a guess", () => {
    expect(parseTextSize("enormous")).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize("")).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize(null)).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize(1.25)).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize({ level: "large" })).toBe(DEFAULT_TEXT_SIZE);
  });

  it("a known stored value round-trips", () => {
    writeStoredTextSize("large");
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("large");
    expect(readStoredTextSize()).toBe("large");
  });

  it("a THROWING localStorage does not take the read down", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => readStoredTextSize()).not.toThrow();
    expect(readStoredTextSize()).toBe(DEFAULT_TEXT_SIZE);
    spy.mockRestore();
  });

  it("a THROWING localStorage does not take the write down either", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeStoredTextSize("large")).not.toThrow();
    spy.mockRestore();
  });

  it("and a failed WRITE still leaves the size applied for this visit", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<TextSizeControl />);
    fireEvent.click(screen.getByTestId("text-size-large"));
    expect(document.documentElement.style.fontSize).toBe(`${BASE_FONT_PX * 1.25}px`);
    spy.mockRestore();
  });
});

describe("applying it", () => {
  it("sets the root font size in px, so it is an absolute anchor and not a compounding one", () => {
    applyTextSize("large", document.documentElement);
    expect(document.documentElement.style.fontSize).toBe(`${BASE_FONT_PX * 1.25}px`);
    // Applying twice must not compound — a rem value here would double on the second call.
    applyTextSize("large", document.documentElement);
    expect(document.documentElement.style.fontSize).toBe(`${BASE_FONT_PX * 1.25}px`);
  });

  it("records the level on the element, so nothing has to reverse it out of a pixel value", () => {
    applyTextSize("large", document.documentElement);
    expect(document.documentElement.dataset.textSize).toBe("large");
  });

  it("applyStoredTextSize applies what was stored", () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "large");
    expect(applyStoredTextSize()).toBe("large");
    expect(document.documentElement.dataset.textSize).toBe("large");
  });

  it("applyStoredTextSize applies the DEFAULT when nothing was stored", () => {
    expect(applyStoredTextSize()).toBe(DEFAULT_TEXT_SIZE);
    expect(document.documentElement.style.fontSize).toBe(`${BASE_FONT_PX}px`);
  });

  it("applyStoredTextSize survives a corrupt store rather than throwing on boot", () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "{}");
    expect(() => applyStoredTextSize()).not.toThrow();
    expect(document.documentElement.dataset.textSize).toBe(DEFAULT_TEXT_SIZE);
  });
});

describe("the control", () => {
  it("is a radiogroup with a name, not two loose buttons", () => {
    render(<TextSizeControl />);
    const group = screen.getByRole("radiogroup", { name: "Text size" });
    expect(group).toBeVisible();
    expect(screen.getAllByRole("radio").length).toBe(TEXT_SIZES.length);
  });

  it("announces which one is current", () => {
    render(<TextSizeControl />);
    expect(screen.getByTestId(`text-size-${DEFAULT_TEXT_SIZE}`).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("each option has a real accessible name rather than the glyph", () => {
    render(<TextSizeControl />);
    expect(screen.getByRole("radio", { name: "Larger text" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Normal text size" })).toBeVisible();
  });

  it("choosing the larger size applies it AND persists it", () => {
    render(<TextSizeControl />);
    fireEvent.click(screen.getByTestId("text-size-large"));
    expect(document.documentElement.dataset.textSize).toBe("large");
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("large");
    expect(screen.getByTestId("text-size-large").getAttribute("aria-checked")).toBe("true");
  });

  it("and choosing the normal size again goes back", () => {
    render(<TextSizeControl />);
    fireEvent.click(screen.getByTestId("text-size-large"));
    fireEvent.click(screen.getByTestId("text-size-normal"));
    expect(document.documentElement.style.fontSize).toBe(`${BASE_FONT_PX}px`);
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("normal");
  });

  it("mounts showing what was already stored", () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "large");
    render(<TextSizeControl />);
    expect(screen.getByTestId("text-size-large").getAttribute("aria-checked")).toBe("true");
  });

  it("catches up when another tab changes it", () => {
    render(<TextSizeControl />);
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "large");
    fireEvent(window, new StorageEvent("storage", { key: TEXT_SIZE_STORAGE_KEY }));
    expect(screen.getByTestId("text-size-large").getAttribute("aria-checked")).toBe("true");
  });

  it("R2 — the current option is Ink, never brand red", () => {
    render(<TextSizeControl />);
    fireEvent.click(screen.getByTestId("text-size-large"));
    const on = screen.getByTestId("text-size-large");
    expect(on.className).toContain("bg-foreground");
    expect(on.className).not.toContain("bg-primary");
    expect(on.className).not.toContain("destructive");
  });

  it("its buttons are large enough to press — 36px, the control that fixes small text", () => {
    render(<TextSizeControl />);
    for (const b of screen.getAllByRole("radio")) {
      expect(b.className).toMatch(/\bh-9\b/);
      expect(b.className).toMatch(/\bw-9\b/);
    }
  });
});

describe("the wiring, and the thing that would silently defeat it", () => {
  it("main.tsx applies the size BEFORE render, not in an effect", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("applyStoredTextSize()");
    expect(main.indexOf("applyStoredTextSize()")).toBeLessThan(main.indexOf("createRoot("));
  });

  it("the member header carries the control, on desktop AND on mobile", () => {
    const layout = read("src/components/layout/ClientLayout.tsx");
    // Twice: the phone header needs it more than the desktop one, and a member who cannot read
    // the screen cannot reliably find a control hidden behind a hamburger.
    expect(layout.match(/<TextSizeControl/g)?.length).toBe(2);
  });

  it("no member-facing component pins a font size in px — it would ignore the control", () => {
    const roots = ["src/pages/client", "src/components/client"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) {
          const src = readFileSync(full, "utf8");
          // className values only: a px size in a comment is prose, and asserting on prose is a
          // mistake this codebase has already made three times.
          for (const m of src.matchAll(/className=(?:"([^"]*)"|\{[^}]*"([^"]*)"[^}]*\})/g)) {
            const cls = m[1] ?? m[2] ?? "";
            if (/text-\[\d+(\.\d+)?px\]/.test(cls)) {
              offenders.push(path.relative(process.cwd(), full));
            }
          }
        }
      }
    };
    for (const r of roots) walk(path.resolve(process.cwd(), r));
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("the page shell's 28px is written in rem", () => {
    expect(read("src/components/client/PageHeader.tsx")).toContain("text-[1.75rem]");
  });
});
