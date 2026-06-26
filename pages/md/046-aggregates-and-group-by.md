Individual rows tell you one story; aggregates tell you the whole story. Aggregate functions collapse many rows into a single summary value — a count, a total, an average — and `GROUP BY` lets you produce one summary per category instead of just one for the entire table. Together they power most of the "reporting" queries you will ever write.

## Aggregate Functions

SQLite (and standard SQL) ships with five core aggregate functions:

| Function | What it returns |
|---|---|
| `COUNT(*)` | Number of rows |
| `COUNT(col)` | Number of non-NULL values in that column |
| `SUM(col)` | Total of all values |
| `AVG(col)` | Arithmetic mean of all values |
| `MIN(col)` / `MAX(col)` | Smallest / largest value |

Used without `GROUP BY`, they reduce the entire result set to a single row:

```sql
SELECT COUNT(*) AS total_orders,
       SUM(amount) AS revenue,
       AVG(amount) AS avg_order
FROM orders;
```

That returns exactly one row, no matter how many orders exist.

> **Note:** `COUNT(*)` counts every row including those with NULLs. `COUNT(col)` skips rows where that column is NULL. The difference matters when a column is sparsely populated.

## Grouping with GROUP BY

`GROUP BY` splits the rows into buckets — one per unique combination of the grouped columns — and applies the aggregate function inside each bucket independently.

```sql
SELECT customer_id,
       COUNT(*)   AS num_orders,
       SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id;
```

The engine will return one output row per distinct `customer_id`. Think of it as: "for each customer, count their orders and sum their spend."

### The Golden Rule

Every column in `SELECT` must either appear in `GROUP BY` **or** be wrapped in an aggregate function. Mixing a raw column with an aggregate (without grouping on it) is an error in standard SQL — SQLite is more lenient, but the results will be unpredictable, so treat it as an error anyway.

```sql
-- WRONG: region is not grouped and not aggregated
SELECT region, customer_id, COUNT(*)
FROM orders
GROUP BY region;

-- RIGHT
SELECT region, COUNT(*) AS order_count
FROM orders
GROUP BY region;
```

## Filtering Groups with HAVING

`WHERE` runs before grouping and filters individual rows. `HAVING` runs after grouping and filters entire groups.

```sql
SELECT customer_id,
       SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 500;
```

This returns only customers whose total spend exceeds 500. You could not achieve this with `WHERE` because the sum does not exist yet at the row-filtering stage.

A helpful mnemonic: **WHERE filters rows, HAVING filters groups.**

## Try It Yourself

The widget below creates a small `orders` table. Run the default query to see per-customer totals, then experiment — try adding a `HAVING` clause, switch `SUM` to `AVG`, or group by `product` instead.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Aggregates and GROUP BY</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, product TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Alice', 'Widget', 120), (2, 'Bob', 'Gadget', 340), (3, 'Alice', 'Gadget', 95), (4, 'Carol', 'Widget', 210), (5, 'Bob', 'Widget', 180), (6, 'Alice', 'Widget', 300), (7, 'Carol', 'Gadget', 450), (8, 'Bob', 'Gadget', 60);">SELECT customer,
       COUNT(*)        AS num_orders,
       SUM(amount)     AS total_spent,
       ROUND(AVG(amount), 2) AS avg_order
FROM orders
GROUP BY customer
ORDER BY total_spent DESC;</textarea>
  </div>
</div>

Once you are comfortable, try this variation — it filters down to customers who spent more than 400 in total:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · HAVING in action</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, product TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Alice', 'Widget', 120), (2, 'Bob', 'Gadget', 340), (3, 'Alice', 'Gadget', 95), (4, 'Carol', 'Widget', 210), (5, 'Bob', 'Widget', 180), (6, 'Alice', 'Widget', 300), (7, 'Carol', 'Gadget', 450), (8, 'Bob', 'Gadget', 60);">SELECT customer,
       SUM(amount) AS total_spent
FROM orders
GROUP BY customer
HAVING SUM(amount) > 400
ORDER BY total_spent DESC;</textarea>
  </div>
</div>

## Query Execution Order

Understanding *when* each clause runs helps avoid common mistakes:

1. `FROM` — identify the source table(s)
2. `WHERE` — discard rows that don't match
3. `GROUP BY` — split surviving rows into buckets
4. Aggregate functions — compute summaries per bucket
5. `HAVING` — discard buckets that don't match
6. `SELECT` — project the columns you asked for
7. `ORDER BY` — sort the final result

This order explains why you cannot reference a `SELECT` alias inside `WHERE` or `HAVING` in most databases — the alias does not exist yet at those stages.
