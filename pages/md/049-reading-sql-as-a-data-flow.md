Most people learn SQL by memorising keywords. A more powerful approach is to read a query as a *pipeline*: data enters from one end, gets shaped at each stage, and exits the other end as a result set. Once that mental model clicks, unfamiliar queries become readable — and writing new ones becomes systematic.

## SQL is Declarative, but it Executes in Steps

SQL is a declarative language: you state *what* you want, not *how* to fetch it. The database engine works out the how. But even though you are not writing a loop or a function, the engine processes your query in a well-defined sequence of logical steps.

The order in which you *write* the clauses does not match the order in which they *execute*:

| Step | Clause | What it does |
|------|--------|--------------|
| 1 | `FROM` | Identifies the source table(s); produces the initial row set |
| 2 | `WHERE` | Filters rows; only matching rows flow forward |
| 3 | `GROUP BY` | Buckets surviving rows by the grouped column(s) |
| 4 | Aggregate fns | Collapses each bucket into a single summary row |
| 5 | `HAVING` | Filters buckets (groups) by a condition |
| 6 | `SELECT` | Projects — picks and computes the output columns |
| 7 | `ORDER BY` | Sorts the final output |
| 8 | `LIMIT` | Trims the output to *n* rows |

Think of each step as a stage in a factory line. Rows arrive, a machine works on them, and only the survivors move on to the next machine.

> **Note:** This logical order explains a common gotcha — you cannot use a `SELECT` alias inside a `WHERE` clause, because `WHERE` runs *before* `SELECT` assigns names to columns. The alias simply does not exist yet at step 2.

## Tracing a Query Through the Pipeline

A concrete trace makes this tangible. Suppose you have a small `orders` table and want to find the top two customers by total spend, counting only orders over $50:

```sql
SELECT customer,
       SUM(amount) AS total_spent
FROM   orders
WHERE  amount > 50
GROUP  BY customer
HAVING SUM(amount) > 200
ORDER  BY total_spent DESC
LIMIT  2;
```

Walk through each stage:

1. **FROM orders** — all rows enter the pipeline.
2. **WHERE amount > 50** — rows with small amounts are dropped. A $30 order never reaches the grouping stage.
3. **GROUP BY customer** — surviving rows are partitioned into one bucket per customer name.
4. **SUM(amount)** — each bucket is collapsed into a single row with the summed amount.
5. **HAVING SUM(amount) > 200** — customers whose qualifying orders sum to $200 or less are discarded entirely.
6. **SELECT customer, SUM(amount) AS total_spent** — only these two columns are kept; the aggregate gets its alias.
7. **ORDER BY total_spent DESC** — rows are sorted highest-to-lowest.
8. **LIMIT 2** — only the top two rows exit.

Each clause does exactly one job, and they compose cleanly.

## Try It Yourself

The widget below has the `orders` table already set up. The default query runs the full pipeline from the example above. Try removing the `WHERE` clause — notice how customers with only small orders now appear in the groups. Then add them back and raise the `HAVING` threshold.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Data flow pipeline</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Alice', 120), (2, 'Bob', 340), (3, 'Alice', 30), (4, 'Carol', 210), (5, 'Bob', 180), (6, 'Alice', 300), (7, 'Carol', 450), (8, 'Bob', 40), (9, 'Dana', 45), (10, 'Dana', 60);">SELECT customer,
       SUM(amount) AS total_spent
FROM   orders
WHERE  amount > 50
GROUP  BY customer
HAVING SUM(amount) > 200
ORDER  BY total_spent DESC
LIMIT  2;</textarea>
  </div>
</div>

Now try this variation — remove the `LIMIT` and lower the `HAVING` threshold to 100 to see more customers qualify:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Adjusting the pipeline</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Alice', 120), (2, 'Bob', 340), (3, 'Alice', 30), (4, 'Carol', 210), (5, 'Bob', 180), (6, 'Alice', 300), (7, 'Carol', 450), (8, 'Bob', 40), (9, 'Dana', 45), (10, 'Dana', 60);">SELECT customer,
       COUNT(*)        AS num_orders,
       SUM(amount)     AS total_spent,
       ROUND(AVG(amount), 2) AS avg_order
FROM   orders
WHERE  amount > 50
GROUP  BY customer
HAVING total_spent > 100
ORDER  BY total_spent DESC;</textarea>
  </div>
</div>

> **Note:** SQLite allows referencing a `SELECT` alias (`total_spent`) inside `HAVING`, but most other databases (PostgreSQL, MySQL in strict mode) do not — they require repeating `SUM(amount) > 100`. For portability, prefer the explicit form.

## Why This Mental Model Matters

Reading SQL as a data flow pays dividends beyond just understanding one query:

- **Debugging** — when a result looks wrong, walk through the pipeline stage by stage. Is the row being dropped by `WHERE` before it even reaches `GROUP BY`? Is the `HAVING` filter too aggressive?
- **Performance intuition** — filtering early (at `WHERE`) is cheaper than filtering late (at `HAVING`), because fewer rows travel through the expensive grouping and aggregation stages.
- **Writing new queries** — instead of staring at a blank editor, start at `FROM`, pick your source, add a `WHERE` if you need to narrow rows, add `GROUP BY` if you need summaries, and work forward. The shape of the result follows naturally.

SQL's verbosity is a feature here: each clause declares one intent, and together they read almost like a recipe for transforming data.
