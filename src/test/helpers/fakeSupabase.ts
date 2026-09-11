/**
 * A SUPABASE CLIENT YOU CAN ASSERT AGAINST — enough of PostgREST's shape to RUN a handler.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * The webhook's handlers decide whether an elderly member is billed by us, by their bank, or by
 * nobody. Every test about them used to be a source scan: "the file contains
 * `billing_source: 'stripe'`". That proves a line is written. It does not prove the member ends
 * up `stripe`, that the switch columns are cleared in the same write, that a SEPA session
 * completing `unpaid` activates nobody, or that a bounced debit puts them back on Santander —
 * which is the half of the billing migration's "PROVE" that is OURS rather than Stripe's.
 *
 * So this fake records every table write and answers every read from a seeded store, and the
 * handlers run against it unmodified.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────────
 *
 * NOT a database. It does not enforce RLS, constraints, triggers or types — those are proven by
 * execution against real PostgreSQL in `scripts/rls/isolation.sql`, which is the right place for
 * them and cannot be replaced by a fake. This answers the other question: given what the database
 * would have returned, what does the handler DO?
 *
 * NOT Stripe either. It cannot prove that Stripe charges the full fee at once or bills again on
 * the 15th — only a test clock against the real API can, and that needs a key this environment
 * does not have (BILLING_MIGRATION_REPORT.md §6).
 *
 * ── THE ONE RULE FOR READING A TEST THAT USES IT ──────────────────────────────
 *
 * An unseeded read returns `{ data: null }` rather than throwing, because that is what PostgREST
 * does and handlers must cope with it. So a test that asserts nothing about the writes proves
 * nothing at all — assert on `db.writes`.
 */

export interface RecordedWrite {
  table: string;
  op: "insert" | "update";
  values: Record<string, unknown>;
  /** The `.eq()` filters that were applied, in order. */
  filters: Array<[string, unknown]>;
}

export interface RecordedInvoke {
  fn: string;
  body: Record<string, unknown>;
}

export interface RecordedRpc {
  fn: string;
  args: Record<string, unknown>;
}

/** What a seeded table returns. Keyed by table name; the handler's filters are recorded, not applied. */
export type Seed = Record<string, Array<Record<string, unknown>>>;

export interface FakeDb {
  writes: RecordedWrite[];
  invokes: RecordedInvoke[];
  rpcs: RecordedRpc[];
  /** Every write to one table, in order — the usual assertion. */
  writesTo(table: string): RecordedWrite[];
  /** Make one table's next read fail, to prove a handler reports rather than swallows. */
  failRead(table: string, message: string): void;
  /** Make one table's next write fail. */
  failWrite(table: string, message: string): void;
  /** What `rpc(fn)` should return. */
  rpcReturns(fn: string, value: unknown): void;
  /**
   * Model a UNIQUE index: a second insert carrying a value this column has already seen fails
   * the way PostgREST reports one, with a 23505.
   *
   * This is what makes "just run it again" assertable rather than described. The billing
   * migration runner CLAIMS each send by inserting a `notification_log` row carrying
   * `billing-switch:<member>:<renewal>:<kind>` against exactly such an index; a re-run, an
   * overlapping run and a crash halfway through 431 members all have to resolve to the same
   * outcome, and the only way to see that is to make the second insert behave like the database.
   */
  uniqueIndex(table: string, column: string): void;
  client: unknown;
}

export function fakeSupabase(seed: Seed = {}): FakeDb {
  const writes: RecordedWrite[] = [];
  const invokes: RecordedInvoke[] = [];
  const rpcs: RecordedRpc[] = [];
  const readFailures = new Map<string, string>();
  const writeFailures = new Map<string, string>();
  const rpcValues = new Map<string, unknown>();
  const uniqueColumns = new Map<string, string>();
  const seenUnique = new Map<string, Set<unknown>>();

  const db: FakeDb = {
    writes,
    invokes,
    rpcs,
    writesTo: (table) => writes.filter((w) => w.table === table),
    failRead: (table, message) => readFailures.set(table, message),
    failWrite: (table, message) => writeFailures.set(table, message),
    rpcReturns: (fn, value) => rpcValues.set(fn, value),
    uniqueIndex: (table, column) => {
      uniqueColumns.set(table, column);
      seenUnique.set(table, new Set());
    },
    client: null,
  };

  /**
   * One builder object that is both thenable and chainable, because PostgREST's is: a handler may
   * `await` after `.eq()`, after `.select()`, or after `.maybeSingle()`, and all three have to
   * resolve to `{ data, error }`.
   */
  function builder(table: string, op: "select" | "insert" | "update", values: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = [];
    let rows = seed[table] ? [...seed[table]] : [];
    let single = false;

    const settle = () => {
      if (op === "select") {
        const failure = readFailures.get(table);
        if (failure) {
          readFailures.delete(table);
          return { data: null, error: { message: failure } };
        }
        return single
          ? { data: rows[0] ?? null, error: null }
          : { data: rows, error: null };
      }
      const failure = writeFailures.get(table);
      if (failure) {
        writeFailures.delete(table);
        return { data: null, error: { message: failure } };
      }

      const uniqueColumn = uniqueColumns.get(table);
      if (op === "insert" && uniqueColumn) {
        const seen = seenUnique.get(table)!;
        const inserted = Array.isArray(values) ? values : [values];
        for (const row of inserted as Array<Record<string, unknown>>) {
          const key = row?.[uniqueColumn];
          if (key === undefined || key === null) continue;
          if (seen.has(key)) {
            // What Postgres says, and what the caller has to cope with: a plain INSERT that hits
            // a unique index is an ERROR, not an empty result.
            return {
              data: null,
              error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}.${uniqueColumn}` },
            };
          }
          seen.add(key);
        }
      }

      writes.push({ table, op, values, filters: [...filters] });
      /* An INSERT returns the row it wrote; an UPDATE returns the rows it matched. That
         difference is how a caller tells "nothing matched" from "it worked", so the fake has to
         keep it. */
      if (op === "insert") {
        return { data: Array.isArray(values) ? values : [values], error: null };
      }
      return { data: rows, error: null };
    };

    const self: Record<string, unknown> = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        rows = rows.filter((r) => r[column] === undefined || r[column] === value);
        return self;
      },
      in(column: string, list: unknown[]) {
        filters.push([column, list]);
        rows = rows.filter((r) => r[column] === undefined || list.includes(r[column]));
        return self;
      },
      not(column: string, _op: string, value: unknown) {
        filters.push([`not.${column}`, value]);
        return self;
      },
      order() {
        return self;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return self;
      },
      select() {
        return self;
      },
      maybeSingle() {
        single = true;
        return self;
      },
      single() {
        single = true;
        return self;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(settle()).then(resolve, reject);
      },
    };
    return self;
  }

  db.client = {
    from(table: string) {
      return {
        select: () => builder(table, "select", {}),
        insert: (values: Record<string, unknown>) => builder(table, "insert", values),
        update: (values: Record<string, unknown>) => builder(table, "update", values),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: rpcValues.get(fn) ?? null, error: null });
    },
    functions: {
      invoke(fn: string, opts: { body: Record<string, unknown> }) {
        invokes.push({ fn, body: opts.body });
        return Promise.resolve({ data: { success: true }, error: null });
      },
    },
  };

  return db;
}
