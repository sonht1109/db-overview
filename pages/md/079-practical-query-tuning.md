Writing a query that returns the right rows is step one. Writing a query that returns them *fast* is step two — and step two matters a lot once your tables grow past a few thousand rows. Query tuning is the craft of reading what the database is actually doing and nudging it toward something cheaper.

## Understand What the Engine Is Doing

Before you change anything, look at the query plan. Most databases expose this through `EXPLAIN` (SQLite, MySQL, Postgres) or `EXPLAIN ANALYZE` (Postgres, which also runs the query and shows real timings).

```sql
EXPLAIN QUERY PLAN
SELECT o.id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.total > 500;
```

The output tells you which tables are scanned, which indexes are used, and the estimated cost of each step. The two things to watch for:

| Plan term | What it means | Usually bad when… |
|---|---|---|
| **SCAN** (full table scan) | Reads every row | Table is large |
| **SEARCH** (index scan) | Jumps to matching rows | — (this is what you want) |
| **TEMP B-TREE** | Sorts or groups with a temporary structure | Happens on large result sets |

If you see a full scan on a column you filter or join on frequently, that column is a candidate for an index.

## Indexes: The Fastest Lever

An index is a sorted auxiliary structure the engine maintains so it can find rows without reading the whole table. Adding one to a high-cardinality filter column often drops query time from seconds to milliseconds.

```sql
-- Without this index, filtering by customer_id requires a full scan of orders.
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- Composite indexes help when you filter on multiple columns together.
CREATE INDEX idx_orders_customer_total ON orders(customer_id, total);
```

> **Note:** Indexes speed up reads but slow down writes because the index must be updated on every INSERT, UPDATE, and DELETE. Don't index every column — focus on columns that appear in `WHERE`, `JOIN ON`, and `ORDER BY` clauses with many distinct values.

Try it yourself. The widget below sets up a small `orders` table with and without an index. Run `EXPLAIN QUERY PLAN` to see the difference, then toggle the index and run again.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Index vs. full scan</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO customers VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'); CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL); INSERT INTO orders VALUES (1,1,120.00),(2,2,650.00),(3,1,310.00),(4,3,820.00),(5,2,45.00),(6,3,990.00); CREATE INDEX idx_orders_cust ON orders(customer_id);">EXPLAIN QUERY PLAN
SELECT o.id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.total > 500;</textarea>
  </div>
</div>

## Write Queries the Optimizer Can Help With

The query optimizer rewrites your SQL before running it, but some patterns make its job harder:

**Avoid functions on indexed columns in WHERE clauses.** Wrapping a column in a function prevents index use.

```sql
-- Bad: the index on order_date cannot be used
WHERE strftime('%Y', order_date) = '2024'

-- Better: let the column stand alone
WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'
```

**Use `EXISTS` instead of `COUNT` when you only care whether rows exist.**

```sql
-- Wasteful: counts all matching rows just to check if any exist
WHERE (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) > 0

-- Better: stops at the first match
WHERE EXISTS (SELECT 1 FROM orders WHERE customer_id = c.id)
```

**Limit early when possible.** If you only need the top 10 rows, add `LIMIT 10` — the engine can often skip computing the full result.

## A Tuning Workflow

When a query is slow, work through this sequence rather than guessing:

1. **Measure first.** Record the baseline execution time. Tools like `EXPLAIN ANALYZE` (Postgres) or simply timing the query in your client work fine.
2. **Read the plan.** Find the most expensive step — usually the widest scan or the largest sort.
3. **Add or adjust one index.** Target the column in the expensive step.
4. **Re-run the plan.** Confirm the engine uses the new index.
5. **Measure again.** Verify the real-world improvement. Estimated costs and actual runtimes sometimes diverge.

The widget below lets you explore a join with aggregation — a common pattern where indexes and `GROUP BY` interact. Try adding a `WHERE` clause or an `ORDER BY total DESC LIMIT 5` to see how the plan changes.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Aggregation and plan exploration</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO customers VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave'); CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL, status TEXT); INSERT INTO orders VALUES (1,1,120.00,'shipped'),(2,2,650.00,'shipped'),(3,1,310.00,'pending'),(4,3,820.00,'shipped'),(5,2,45.00,'cancelled'),(6,3,990.00,'shipped'),(7,4,200.00,'pending'),(8,4,80.00,'shipped'); CREATE INDEX idx_orders_customer ON orders(customer_id);">SELECT c.name,
       COUNT(o.id)   AS order_count,
       SUM(o.total)  AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'shipped'
GROUP BY c.id, c.name
ORDER BY revenue DESC;</textarea>
  </div>
</div>

> **Note:** Query tuning is iterative. A change that helps on a small dataset may not matter — or may even hurt — at production scale. Always test against realistic data volumes when you can.
