Sometimes the data you need is not stored directly — it is calculated from data that is already there. A customer's age follows from their birth date. A line item's total follows from unit price times quantity. You could compute these values in your application every time, or you could let the database handle it. **Derived data** is any value produced by transforming or combining stored values. **Computed columns** (also called generated columns) are the database feature that bakes that derivation directly into the schema.

## Deriving Values in Queries

The simplest form of derived data is a column expression in a `SELECT` statement. Nothing is stored; the database computes it on the fly each time the query runs.

```sql
SELECT
  product,
  quantity,
  unit_price,
  quantity * unit_price AS line_total
FROM order_items;
```

`line_total` does not exist in the table. The database evaluates the expression row by row and hands back the result. You can filter, sort, and aggregate on it just like a real column:

```sql
SELECT product, quantity * unit_price AS line_total
FROM order_items
WHERE quantity * unit_price > 50
ORDER BY line_total DESC;
```

> **Note:** Repeating the expression in `WHERE` and `ORDER BY` is required in standard SQL because those clauses are evaluated before `SELECT`. Some databases let you reuse the alias in `ORDER BY`, but SQLite does too — try it in the widget below.

Try the widget to see derived columns in action. Edit the query to add a column that shows a 10 % discount amount.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Derived columns in SELECT</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE order_items (id INTEGER PRIMARY KEY, product TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL); INSERT INTO order_items VALUES (1, 'Headphones', 2, 39.99); INSERT INTO order_items VALUES (2, 'USB Cable', 5, 4.99); INSERT INTO order_items VALUES (3, 'Keyboard', 1, 89.00); INSERT INTO order_items VALUES (4, 'Mouse', 3, 24.50);">SELECT
  product,
  quantity,
  unit_price,
  quantity * unit_price            AS line_total,
  ROUND(quantity * unit_price * 0.10, 2) AS discount
FROM order_items
ORDER BY line_total DESC;</textarea>
  </div>
</div>

## Generated (Computed) Columns

Inline expressions work well, but they scatter the same formula across many queries. If the formula changes, you must hunt down every copy. **Generated columns** solve this by defining the expression once, in the table definition. The database then makes it available as a regular column.

SQLite (version 3.31+), PostgreSQL, MySQL, and SQL Server all support generated columns, though the syntax differs slightly. In SQLite:

```sql
CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY,
  product    TEXT    NOT NULL,
  quantity   INTEGER NOT NULL,
  unit_price REAL    NOT NULL,
  line_total REAL    GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL
);
```

Now any query can just write `SELECT line_total FROM order_items` — no formula needed at the call site.

### Virtual vs. Stored

Generated columns come in two flavors:

| Kind | How it works | Disk space | Can be indexed? |
|------|-------------|-----------|----------------|
| **Virtual** | Recomputed on every read | No extra space | Limited support |
| **Stored** | Computed on insert/update, persisted to disk | Uses space | Yes, in most engines |

Use **stored** when you query the column frequently and want to index it. Use **virtual** when storage is tight and the expression is cheap to recompute.

```sql
-- Stored generated column (persisted to disk)
CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY,
  product    TEXT    NOT NULL,
  quantity   INTEGER NOT NULL,
  unit_price REAL    NOT NULL,
  line_total REAL    GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

The widget below creates a table with a generated column. Try inserting a new row — notice you do not supply `line_total`; the database fills it in automatically.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Generated column</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE order_items (id INTEGER PRIMARY KEY, product TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, line_total REAL GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL); INSERT INTO order_items (id, product, quantity, unit_price) VALUES (1, 'Headphones', 2, 39.99); INSERT INTO order_items (id, product, quantity, unit_price) VALUES (2, 'USB Cable', 5, 4.99); INSERT INTO order_items (id, product, quantity, unit_price) VALUES (3, 'Keyboard', 1, 89.00);">-- line_total is computed automatically
SELECT product, quantity, unit_price, line_total
FROM order_items;

-- Try inserting a new row and re-running:
-- INSERT INTO order_items (id, product, quantity, unit_price)
-- VALUES (4, 'Mouse', 3, 24.50);</textarea>
  </div>
</div>

## Views as Reusable Derived Data

When derived data spans multiple tables or involves complex expressions, a **view** is often a better fit than a generated column. A view is a named, saved query that looks like a table to any query that uses it.

```sql
CREATE VIEW order_summary AS
SELECT
  oi.id,
  oi.product,
  oi.quantity * oi.unit_price        AS line_total,
  c.name                              AS customer
FROM order_items oi
JOIN customers c ON c.id = oi.customer_id;
```

Queries can now do `SELECT * FROM order_summary WHERE line_total > 50` without knowing the underlying join. The derivation lives in one place, and callers stay simple.

> **Note:** Standard views in most databases are not stored on disk — they re-run the underlying query each time. **Materialized views** (available in PostgreSQL and others) do persist the result for faster reads, at the cost of needing periodic refresh. SQLite does not support materialized views natively.

## When to Use Each Approach

| Approach | Best when… |
|----------|-----------|
| Inline expression in `SELECT` | Ad-hoc queries; formula used once |
| Generated column (virtual) | Formula used often; storage is precious |
| Generated column (stored) | Formula queried heavily and needs an index |
| View | Formula spans tables or is reused across many queries |

The guiding principle is the same as normalization: define each fact in one place. If `line_total` is always `quantity * unit_price`, encode that relationship in the schema rather than scattering the formula through application code and queries.
