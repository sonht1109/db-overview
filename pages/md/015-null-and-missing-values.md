Every table you design will eventually face a question no data type can answer on its own: *what do you store when the value is unknown or does not apply?* The answer in SQL is `NULL` — and it behaves in ways that surprise almost every newcomer. Understanding NULL now will save you from subtle bugs later.

## What NULL Is (and Is Not)

`NULL` is not zero, not an empty string, and not `false`. It is the explicit absence of a value — a marker that says "this cell has no known value."

| Value | Means |
|---|---|
| `0` | The number zero — a real, known value |
| `''` | An empty string — still a real, known value |
| `NULL` | Unknown, missing, or not applicable |

Consider a `users` table where `phone` is optional. A user who has not provided a phone number should have `NULL` there, not an empty string. That distinction matters when you later query "give me all users who have a phone number" — an empty string would silently slip through.

```sql
CREATE TABLE users (
  user_id  INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  email    TEXT    NOT NULL,
  phone    TEXT             -- NULL = not provided
);
```

The column `phone` has no `NOT NULL` constraint, so the database will accept rows that omit it.

## The Three-Valued Logic of NULL

Here is the trap. In ordinary logic, a statement is either true or false. In SQL, comparisons involving NULL produce a third result: **UNKNOWN**. A row only makes it into your result set if its `WHERE` condition evaluates to `TRUE` — not UNKNOWN.

This has one critical consequence: **you cannot compare NULL with `=`**.

```sql
-- This returns NO rows, even if phone IS NULL in the table
SELECT * FROM users WHERE phone = NULL;

-- This is correct — always use IS NULL or IS NOT NULL
SELECT * FROM users WHERE phone IS NULL;
```

The same rule applies to inequality: `phone != NULL` also returns UNKNOWN for every row. SQL gives you dedicated operators exactly for this:

| Operator | Use it to |
|---|---|
| `IS NULL` | Find rows where the value is absent |
| `IS NOT NULL` | Find rows where a value is present |

### NULL in aggregate functions

Most aggregate functions silently skip NULLs:

```sql
SELECT AVG(score) FROM results;
-- AVG ignores NULL rows; it averages only the non-NULL scores
```

`COUNT(*)` counts all rows. `COUNT(column)` counts only non-NULL values in that column. Knowing which one you want matters.

## Experimenting with NULL

The widget below sets up a small `orders` table where `shipped_at` is optional — orders that have not shipped yet have `NULL` there. Try the starter query, then edit it to find only shipped orders, or calculate how many are still pending.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · NULL and missing values</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount_cents INTEGER NOT NULL, shipped_at TEXT); INSERT INTO orders VALUES (1, 'Alice', 4999, '2024-03-01'), (2, 'Bob', 1200, NULL), (3, 'Carol', 8750, '2024-03-05'), (4, 'Dave', 300, NULL), (5, 'Eve', 2200, '2024-03-07');">-- How many orders have not shipped yet?
SELECT
  COUNT(*)            AS total_orders,
  COUNT(shipped_at)   AS shipped,
  COUNT(*) - COUNT(shipped_at) AS pending
FROM orders;</textarea>
  </div>
</div>

> **Note:** Try replacing `COUNT(shipped_at)` with `COUNT(*)` and notice the difference. Then add a `WHERE shipped_at IS NULL` clause to list only the pending orders by name.

## Designing Around NULL

NULL is useful, but overusing it creates headaches. A few guidelines:

- **Use `NOT NULL` as the default.** Add it to every column unless you have a specific reason for the value to be absent. Fewer NULLs means simpler queries.
- **Distinguish "unknown" from "not applicable."** If a column simply does not apply to certain rows, consider whether those rows belong in a separate table instead.
- **Be careful with `COALESCE`.** The `COALESCE(a, b)` function returns the first non-NULL argument. It is handy for providing fallback values in queries, but using it to paper over a design problem can hide bugs.

```sql
-- Return a display label, falling back to 'No phone' if NULL
SELECT name, COALESCE(phone, 'No phone') AS phone_display
FROM users;
```

NULL is one of the most frequently misunderstood corners of SQL. The key insight to carry forward: NULL is not a value — it is the *absence* of one, and the database treats it that way at every step from comparison to aggregation.
