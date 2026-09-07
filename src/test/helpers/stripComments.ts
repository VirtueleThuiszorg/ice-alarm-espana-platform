// A source scanner must read CODE, not prose.
//
// This codebase has now produced the same slip five times: an assertion that a word is ABSENT
// from a file matches the comment explaining its absence. Twice it was inside a measuring
// instrument, where it is worse — `memberRedButtons.test.tsx` counted a `<Button` written inside
// a comment ABOUT a button, and `staffInternalNotes.test.ts` flagged the very module whose
// comment explains that `sender_type: "system"` was the leak.
//
// BLOCK COMMENTS ONLY, and no attempt to match a surrounding JSX brace pair. An earlier version
// matched a whole JSX comment including its braces and SWALLOWED 3KB of real markup in
// `MedicalInfoPage`: a JSX expression that merely contains a note does not end with a comment
// terminator immediately followed by a closing brace, so the lazy match ran on to the next place
// that did, taking two real buttons with it. Removing the comment BODY leaves an empty brace
// pair, which every scanner here ignores, and there is nothing left to over-match.
//
// (Line comments rather than a block, deliberately: a block comment describing a comment stripper
// cannot quote a comment terminator without closing itself. That cost a parse error once.)
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
