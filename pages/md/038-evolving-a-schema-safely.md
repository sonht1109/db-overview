Schemas are never finished. A table you design today will need a new column next month, a renamed column next year, and maybe a split into two tables after that. The challenge is making those changes without breaking the application reading from the database or losing data that already exists. This discipline is called **schema migration** — and doing it safely is one of the most practical skills in database engineering.

## What Can Go Wrong

Most schema changes that feel simple are actually **breaking changes** if you are not careful. Here are the most common traps:

| Change | Risk |
|--------|------|
| `DROP COLUMN` | Permanently destroys data; old code still referencing the column fails |
| `RENAME COLUMN` | Every query using the old name breaks immediately |
| `ALTER COLUMN` type (e.g. TEXT → INTEGER) | Existing values may not coerce; app code expects old type |
| `ADD COLUMN NOT NULL` with no default | All existing rows violate the constraint instantly |
| `DROP TABLE` | No recovery without a backup |

The pattern behind all of these: **the database and the application code can be out of sync**. Your app may be deployed and reading data while you are in the middle of running a migration. Even a one-second gap matters at scale.

> **Note:** In production systems with multiple app servers, a migration and a code deploy never happen at the exact same millisecond. Safe migrations account for the window where old code runs against the new schema, or new code runs against the old one.

## Safe Patterns for Common Changes

The golden rule is to **prefer additive changes** — adding things is almost always safe; removing or renaming things is risky. Here is how to handle the most common scenarios safely.

### Adding a column

Always supply a default value (or allow NULL) so existing rows are not immediately invalid:

```sql
-- Safe: existing rows get NULL, no constraint violation
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Safe: existing rows get the default value
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- UNSAFE: existing rows have no value to fill in
-- ALTER TABLE orders ADD COLUMN status TEXT NOT NULL;
```

### Renaming a column (the expand-contract pattern)

Never rename in one step. Instead, use a three-phase process:

1. **Expand** — add the new column alongside the old one.
2. **Migrate** — copy data from the old column to the new one; update app code to write to both.
3. **Contract** — once no code reads the old column, drop it.

```sql
-- Phase 1: add the new column
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Phase 2: back-fill from old column
UPDATE users SET full_name = username WHERE full_name IS NULL;

-- Phase 3: drop the old column only after all code is updated
-- ALTER TABLE users DROP COLUMN username;
```

This keeps the database and application compatible during every phase of deployment.

### Dropping a table or column

Always **deprecate before you delete**. Stop writing to the column in your application code and leave it in place for at least one full release cycle. Once you are confident nothing reads it, then drop it. If in doubt, a cheap insurance policy is to rename it to something like `_deprecated_username` — a visible signal without permanent deletion.

## Migrations as Code

Rather than running SQL by hand in a database console, modern teams write migration files — versioned SQL scripts checked into source control. Each file has an `up` direction (apply the change) and a `down` direction (roll it back):

```sql
-- migration: 0042_add_status_to_orders.up.sql
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- migration: 0042_add_status_to_orders.down.sql
ALTER TABLE orders DROP COLUMN status;
```

Tools like **Flyway**, **Liquibase**, and **Alembic** (Python) track which migrations have been applied and run only the ones that are new. The database itself keeps a `schema_versions` table so the tool always knows the current state.

Try the widget below to see the expand-contract pattern in action. Run the default query to inspect the initial table, then try the `UPDATE` to back-fill the new column, and finally query again to confirm all rows have data in both columns.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Expand-contract rename</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL); INSERT INTO users VALUES (1, 'alice', 'alice@example.com'); INSERT INTO users VALUES (2, 'bob_p', 'bob@example.com'); INSERT INTO users VALUES (3, 'carol99', 'carol@example.com'); ALTER TABLE users ADD COLUMN full_name TEXT;">-- Phase 1 done: full_name column added (NULL so far)
-- Run this to back-fill it from username (Phase 2):
UPDATE users SET full_name = username WHERE full_name IS NULL;

-- Then inspect the result:
SELECT id, username, full_name, email FROM users;</textarea>
  </div>
</div>

## A Quick Checklist Before You Migrate

<details class="reveal"><summary>Reveal: What questions should you ask before running a schema migration in production?</summary><div class="reveal-body">

1. **Is the change additive?** Adding a nullable column or a new table is almost always safe. Dropping or renaming is not.
2. **Do existing rows satisfy the new constraint?** If adding `NOT NULL`, every existing row must have a value (or a default).
3. **Can old application code still run against the new schema?** The migration may finish before the new app deploy completes.
4. **Can new application code still run against the old schema?** The new deploy may start before the migration runs.
5. **Do you have a tested rollback?** Know exactly which SQL undoes the change before you apply it.
6. **Is there a backup?** For destructive changes, take a snapshot first.

</div></details>

Migrations are a normal, recurring part of working with databases. Building the habit of writing them as versioned files, testing the rollback, and thinking about the deployment window will save you from the kind of incident that wakes people up at 3 a.m.
