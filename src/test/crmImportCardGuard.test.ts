// @vitest-environment node
//
// A PAYMENT CARD MUST NOT REACH `member_bank_details`.
//
// `20 Digit Bank No` is the single restricted column `mapIceCsv` reads, and `parseBankCell` used
// to copy whatever it held straight into `member_bank_details.source_text`. What it holds is not
// always a bank account. Four known rows carry a full PAN and an expiry date instead: karmaCRM
// 11667665 in the live file, and 11399174, 11337706 and 11279347 in the cancelled group — the
// last three found by scanning the queued files BEFORE importing them, which is the only reason
// they are a test and not an incident. Ids, not names: see the note in iceCrmImport.ts.
//
// EVERY NUMBER BELOW IS SYNTHETIC. They are the publicly documented card test numbers, chosen so
// that this file reproduces the SHAPE of each real cell — grouping, separators, trailing expiry —
// without a real PAN ever entering the repository. The shapes are copied from the files; the
// digits are not.
import { describe, it, expect } from "vitest";
import { looksLikeACard, parseBankCell } from "@/lib/iceCrmImport";

/** Luhn-valid, correct major industry identifier, never issued to anyone. */
const VISA = "4111111111111111";
const MASTERCARD = "5500005555555559";
const AMEX = "340000000000009";

describe("looksLikeACard", () => {
  it.each([
    ["a bare PAN", VISA],
    ["grouped in fours, as karmaCRM 11279347's cell is", "4111 1111 1111 1111..02/24"],
    ["dot-separated with an expiry, as karmaCRM 11399174's cell is", "5500.0055.5555.5559..01/25"],
    ["a Mastercard with a spelled-out expiry", `${MASTERCARD} Exp: 12/25`],
    ["15-digit Amex", AMEX],
    ["the words around it, as Antonio's cell reads", `Daughters Card ${VISA} 05/27`],
    ["run on to the end of an expiry with no separator", `${VISA}0527`],
    // id 11337706 in the cancelled file is written exactly like this. The first version of
    // the guard read it as four four-digit runs and let it through.
    ["double-dot separators between groups", "5500..0055..5555..5559 // eXP: 03/23"],
    ["mixed separators", `5500-0055.5555 5559  12/25`],
  ])("refuses %s", (_label, cell) => {
    expect(looksLikeACard(cell)).toBe(true);
    expect(parseBankCell(cell)).toEqual({
      iban: null,
      bank_name: null,
      source_text: "",
      cardRefused: true,
    });
  });

  it.each([
    ["a 20-digit Spanish CCC — the content this column is named for", "21000418450200051332"],
    ["a CCC written in groups", "2100 0418 45 0200051332"],
    ["a Spanish IBAN", "ES9121000418450200051332"],
    ["an Irish IBAN", "IE29AIBK93115212345678"],
    ["a Lithuanian IBAN", "LT121000011101001000"],
    ["a British IBAN", "GB29NWBK60161331926819"],
    ["an IBAN with the account repeated after it", "ES9121000418450200051332 21000418450200051332"],
    ["a bank name and an IBAN", "Banco Sabadell IBAN ES91 2100 0418 4502 0005 1332"],
    ["an empty cell", ""],
    ["prose", "See Mrs file foe details."],
    ["a sort code and account number", "60-16-13 31926819"],
    // Luhn-valid and sixteen digits, but it starts 0 — an account number, not a card. This pins
    // the major-industry-identifier check: without it, the guard would empty this cell.
    ["a Luhn-valid 16-digit account number that is not a card", "0081054405000133"],
    // THE CASE THE EXPIRY-TAIL CONDITION EXISTS FOR, and the one a mutation pass showed was
    // untested. A Cajamar CCC starts 3058, so the major-industry check does not save it; its
    // leading sixteen digits are Luhn-valid, so the prefix rule would refuse it. What saves it is
    // that the four digits left over are `1332`, and 13 is not a month. Drop that condition and
    // this legitimate account is emptied — which is how the rule earns its place.
    ["a Cajamar CCC whose leading 16 digits happen to Luhn", "30580000000000051332"],
    ["the same CCC written in groups", "3058 0000 0000 0005 1332"],
  ])("allows %s", (_label, cell) => {
    expect(looksLikeACard(cell)).toBe(false);
  });

  it("keeps a legitimate account readable rather than refusing it wholesale", () => {
    const parsed = parseBankCell("Banco Sabadell IBAN ES91 2100 0418 4502 0005 1332");
    expect(parsed.cardRefused).toBe(false);
    expect(parsed.iban).toBe("ES9121000418450200051332");
    expect(parsed.source_text).not.toBe("");
  });

  it("drops the WHOLE cell, not just the digits — no half-record survives", () => {
    // A cell that held a card has already shown it is not a bank record. Keeping the remainder
    // would leave something nobody can trust, and risks keeping part of the card itself.
    const parsed = parseBankCell(`Santander ${VISA} exp 05/27 sort 60-16-13`);
    expect(parsed.source_text).toBe("");
    expect(parsed.bank_name).toBeNull();
    expect(parsed.iban).toBeNull();
  });
});
