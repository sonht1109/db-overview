Data quality is not something you bolt on after a system is built — it is something you architect from the start. The relational model gives you a set of tools to express the *rules* of your data directly in the schema, so the database engine enforces them on every write, from every client, forever. This is integrity by design.

## Three Kinds of Integrity

Database integrity breaks into three distinct guarantees. Understanding each one helps you know which tool to reach for.

| Kind | What it promises | Enforced by |
|---|---|---|
| **Entity integrity** | Every row is uniquely identifiable | `PRIMARY KEY` |
| **Referential integrity** | Every foreign key value points to a row that exists | `FOREIGN KEY` |
| **Domain integrity** | Every column value is valid for that column's meaning | `NOT NULL`, `CHECK`, data types |

Together, these three layers mean a database can actively *reject* bad data rather than silently store it and let problems emerge later.

## Entity Integrity: No Ambiguous Rows

A table without a primary key is a table where rows can be identical — there is no reliable way to address, update, or delete a specific row. The `PRIMARY KEY` constraint eliminates that ambiguity. It combines `NOT NULL` and `UNIQUE` into a single declaration: every row must have an identifier, and no two rows may share one.

```sql
CREATE TABLE products (
  product_id   INTEGER PRIMARY KEY,  -- never null, always unique
  name         TEXT    NOT NULL,
  price        REAL    NOT NULL CHECK (price >= 0)
);
```

Choosing what to use as a primary key is a design decision. **Surrogate keys** (auto-incrementing integers, UUIDs) are stable by default — a product's internal ID won't change if its name or price changes. **Natural keys** (e.g. ISBN, country code) work when the real-world value is truly permanent and unique. In practice, surrogate keys are the safer default.

## Referential Integrity: No Dangling References

A foreign key is a promise: the value in one column must match a primary key value in another table. Without enforcement, you can end up with **orphan rows** — order records referencing a customer that was deleted, log entries pointing to a user that never existed. Queries over such data produce silently wrong results.

```sql
CREATE TABLE orders (
  order_id    INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  total       REAL    NOT NULL CHECK (total > 0)
);
```

The `REFERENCES` clause tells the engine to check every `INSERT` and `UPDATE` on `orders` against the `customers` table. But what should happen when a referenced row is *deleted*? You have options, declared with `ON DELETE`:

| Action | Behavior |
|---|---|
| `RESTRICT` (default) | Block the delete if any child rows exist |
| `CASCADE` | Automatically delete the child rows too |
| `SET NULL` | Set the foreign key column to `NULL` in child rows |
| `SET DEFAULT` | Set the foreign key column to its default value |

The right choice depends on your domain. For orders, `RESTRICT` is usually correct — you rarely want to silently erase order history. For a table of session tokens, `CASCADE` makes sense: delete the user, delete their sessions.

> **Note:** SQLite requires `PRAGMA foreign_keys = ON;` at the start of each connection to enforce foreign key constraints. Most other databases (PostgreSQL, MySQL, SQL Server) enforce them automatically.

## Domain Integrity: Column Values That Make Sense

Domain integrity ensures that column values fall within the set of values that are *meaningful* for that column. The relational model handles this at three levels:

1. **Data type** — a `REAL` column cannot store the text `"hello"`.
2. **`NOT NULL`** — absence of a value is not allowed when presence is required.
3. **`CHECK` constraint** — any boolean expression the engine evaluates on every write.

```sql
CREATE TABLE employees (
  employee_id INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  hire_date   TEXT    NOT NULL,
  salary      REAL    NOT NULL CHECK (salary > 0),
  role        TEXT    NOT NULL CHECK (role IN ('engineer', 'manager', 'analyst'))
);
```

The `CHECK` on `role` turns an open text column into an enforced enumeration. The engine rejects any value not in the list — no application code required.

## Seeing All Three Layers Together

The widget below builds a small schema that exercises all three integrity types. The default query shows the clean data. Try the commented `INSERT` statements one at a time to see each constraint fire.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Integrity in action</span></div>
  <div class="widget-body">
    <textarea data-setup="PRAGMA foreign_keys = ON;
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE
);
CREATE TABLE orders (
  order_id    INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'cancelled')),
  total       REAL NOT NULL CHECK (total > 0)
);
INSERT INTO customers VALUES (1, 'alice@example.com');
INSERT INTO customers VALUES (2, 'bob@example.com');
INSERT INTO orders VALUES (101, 1, 'shipped', 49.99);
INSERT INTO orders VALUES (102, 2, 'pending', 12.00);">-- Inspect the current state
SELECT o.order_id, c.email, o.status, o.total
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id;

-- Try these one at a time to see each integrity layer reject bad data:

-- Entity integrity: duplicate primary key
-- INSERT INTO customers VALUES (1, 'dup@example.com');

-- Referential integrity: no customer 999
-- INSERT INTO orders VALUES (103, 999, 'pending', 5.00);

-- Domain integrity: negative total
-- INSERT INTO orders VALUES (104, 1, 'pending', -1.00);

-- Domain integrity: invalid status value
-- INSERT INTO orders VALUES (105, 1, 'lost', 30.00);

-- Referential integrity: RESTRICT blocks deleting a customer with orders
-- DELETE FROM customers WHERE customer_id = 1;</textarea>
  </div>
</div>

## Why Schema-Level Rules Beat Application-Level Checks

Every application that touches a database can have its own validation logic — but there will always be another client: a migration script, an admin tool, a colleague running SQL directly. Application-level checks protect *one* entry point; schema constraints protect *all* of them.

There is also a subtler benefit: the engine can use constraints as optimization hints. A `NOT NULL` column can be stored more compactly. A `PRIMARY KEY` implies an index. A `UNIQUE` constraint is itself an index. Rules are not just guards — they are information the engine uses to store and retrieve data more efficiently.

> **Key idea:** Integrity by design means the database is the authoritative enforcer of your data's rules — not any single application. Define the rules once, in the schema, and every client benefits automatically.
