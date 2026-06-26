An index normally exists purely for speed — it does not care whether two rows share the same value. A **unique index** adds a second job: it enforces that no two rows in the table can hold the same value (or combination of values) for the indexed column(s). You get fast lookups *and* a data-integrity guarantee from a single structure.

## What Makes a Unique Index Different

Under the hood, a unique index is still a B-tree. The difference is that before the engine writes a new leaf entry, it checks whether that key already exists. If it does, the write is rejected with a constraint violation error. This check happens atomically — inside the same write operation — so there is no race condition even with concurrent inserts.

You create one with the `UNIQUE` keyword:

```sql
-- A standalone unique index
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Or a UNIQUE constraint on the column, which creates the same index implicitly
CREATE TABLE users (
    id      INTEGER PRIMARY KEY,
    email   TEXT NOT NULL UNIQUE,
    name    TEXT
);
```

Both approaches produce identical behavior. The `UNIQUE` column constraint is just syntactic sugar; the engine creates a unique index behind the scenes.

> **Note:** A `PRIMARY KEY` is always backed by a unique index too. The difference is that primary keys also prohibit `NULL`, while a `UNIQUE` index typically allows it — and in most databases, multiple `NULL` values are permitted in a unique column because `NULL` is not considered equal to anything (including another `NULL`).

## Unique Indexes on Multiple Columns

Like regular indexes, unique indexes can span more than one column. The uniqueness constraint then applies to the *combination* of values, not each column individually.

```sql
CREATE TABLE team_members (
    team_id INTEGER,
    user_id INTEGER,
    joined_at TEXT,
    UNIQUE (team_id, user_id)   -- a user can appear in many teams, but not twice in the same team
);
```

| team_id | user_id | Allowed? |
|---------|---------|----------|
| 1 | 42 | Yes |
| 1 | 99 | Yes — different user |
| 2 | 42 | Yes — different team |
| 1 | 42 | **No** — duplicate (team 1, user 42) |

This pattern is common for junction tables (many-to-many relationships) where you want to prevent accidental duplicate rows.

## Try It: Enforcing Uniqueness

The widget below creates a `users` table with a unique index on `email`. Try inserting a duplicate to see the constraint fire, then fix the data and re-run.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Unique index in action</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, name TEXT); CREATE UNIQUE INDEX idx_users_email ON users (email); INSERT INTO users VALUES (1, 'alice@example.com', 'Alice'); INSERT INTO users VALUES (2, 'bob@example.com', 'Bob');">-- This will succeed
INSERT INTO users VALUES (3, 'carol@example.com', 'Carol');

-- Uncomment to see the unique constraint violation:
-- INSERT INTO users VALUES (4, 'alice@example.com', 'Alice Again');

SELECT * FROM users;</textarea>
  </div>
</div>

Uncomment the second `INSERT` and run again. SQLite raises `UNIQUE constraint failed: users.email` and rolls back only that statement — the table is untouched. This is the constraint doing its job: bad data never lands.

## Unique Indexes vs. Application-Level Checks

A common mistake is relying on the application to check for duplicates before inserting:

```sql
-- Application does: SELECT COUNT(*) FROM users WHERE email = ?
-- If 0 rows: INSERT INTO users (email, ...) VALUES (?, ...)
```

This approach has a **race condition**: two requests can both pass the count check and both attempt the insert simultaneously. A unique index eliminates the race entirely because the check and the insert are one atomic operation inside the database engine.

> **Note:** The rule of thumb is to enforce uniqueness at the lowest possible layer. Application logic can be bypassed (direct DB access, scripts, migrations). An index-level constraint cannot.

## When to Add a Unique Index

Add a unique index whenever a column or column combination is *semantically* unique in the real world:

- User email addresses or usernames
- Order or invoice numbers
- ISO codes (country codes, currency codes)
- Composite natural keys (e.g., `(flight_id, seat_number)`)

Avoid making a column unique speculatively. Unique constraints are schema commitments — removing one later requires a migration and may surprise callers who depended on the behavior.

<details class="reveal"><summary>Reveal: Does a unique index speed up lookups the same way a regular index does?</summary><div class="reveal-body">Yes — exactly the same. A unique index is still a B-tree, and the engine uses it for <code>WHERE email = ?</code> lookups just as it would any other index. The uniqueness guarantee is a bonus on top of the speed benefit, not a trade-off. In fact, because the engine knows a unique index can return at most one row for an equality predicate, it can sometimes stop searching even earlier than with a non-unique index.</div></details>
