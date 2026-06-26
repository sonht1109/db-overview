So far you have filtered rows with `WHERE` and sorted them with `ORDER BY`. Those operations work on individual rows. **Aggregation** is different: it collapses many rows into a single summary value — a count, a sum, an average, a minimum, or a maximum. **Grouping** lets you compute those summaries separately for each subset of your data. Together, `GROUP BY` and the aggregate functions are among the most practically useful tools in SQL.

## Aggregate Functions

SQLite (and every major relational database) ships with five core aggregate functions:

| Function | Returns |
|---|---|
| `COUNT(*)` | Number of rows |
| `COUNT(expr)` | Number of non-NULL values of expr |
| `SUM(expr)` | Total of all non-NULL values |
| `AVG(expr)` | Arithmetic mean of non-NULL values |
| `MIN(expr)` / `MAX(expr)` | Smallest / largest non-NULL value |

Used without `GROUP BY`, each function collapses the **entire table** into one row:

```sql
SELECT COUNT(*) AS total_orders,
       SUM(amount) AS revenue,
       AVG(amount) AS avg_order
FROM orders;
```

That is useful, but often you want the same numbers broken down by category — by customer, by month, by product. That is where `GROUP BY` comes in.

## Grouping Rows with GROUP BY

`GROUP BY` partitions the result set into groups, one per distinct combination of the grouping columns, and then applies the aggregate function independently to each group.

```sql
SELECT customer_id,
       COUNT(*)   AS order_count,
       SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id;
```

Think of it as: "For each unique value of `customer_id`, count and sum the rows that belong to it." The engine scans all the rows, buckets them by `customer_id`, and emits one output row per bucket.

> **Note:** Every column in the `SELECT` list must either be one of the `GROUP BY` columns or wrapped in an aggregate function. Selecting a column that is neither — for example `SELECT customer_id, product_name, SUM(amount)` while grouping only by `customer_id` — is an error in standard SQL (SQLite is lenient here, but the result is unpredictable).

### Filtering Groups with HAVING

`WHERE` filters **rows before** grouping. To filter **after** aggregation — for example, "only show customers who placed more than two orders" — use `HAVING`:

```sql
SELECT customer_id,
       COUNT(*) AS order_count
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 2;
```

`HAVING` operates on the aggregated result, so aggregate functions are valid inside it. `WHERE` cannot reference aggregate functions at all.

The logical order of a `SELECT` query is:

1. `FROM` — identify the source rows
2. `WHERE` — filter individual rows
3. `GROUP BY` — partition into groups
4. `HAVING` — filter groups
5. `SELECT` — compute output columns
6. `ORDER BY` — sort the final result

## Try It Live

The widget below has a small `orders` table with customers, products, and amounts. Run the default query, then experiment — try grouping by `product`, or add a `HAVING` clause to keep only high-revenue groups.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · GROUP BY and aggregates</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT, product TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Priya', 'Keyboard', 79.99), (2, 'Leon', 'Monitor', 329.00), (3, 'Priya', 'Mouse', 29.99), (4, 'Amara', 'Keyboard', 79.99), (5, 'Leon', 'Keyboard', 79.99), (6, 'Amara', 'Monitor', 329.00), (7, 'Priya', 'Monitor', 329.00), (8, 'Amara', 'Mouse', 29.99);">-- Revenue and order count per customer
SELECT customer,
       COUNT(*)        AS order_count,
       SUM(amount)     AS total_spent,
       ROUND(AVG(amount), 2) AS avg_order
FROM orders
GROUP BY customer
ORDER BY total_spent DESC;</textarea>
  </div>
</div>

Now try filtering with `HAVING`. The widget below starts with the same dataset — edit the query to see only customers who spent more than $400 in total.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · HAVING clause</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT, product TEXT, amount REAL); INSERT INTO orders VALUES (1, 'Priya', 'Keyboard', 79.99), (2, 'Leon', 'Monitor', 329.00), (3, 'Priya', 'Mouse', 29.99), (4, 'Amara', 'Keyboard', 79.99), (5, 'Leon', 'Keyboard', 79.99), (6, 'Amara', 'Monitor', 329.00), (7, 'Priya', 'Monitor', 329.00), (8, 'Amara', 'Mouse', 29.99);">-- Which products had total revenue above $200?
SELECT product,
       SUM(amount) AS revenue
FROM orders
GROUP BY product
HAVING SUM(amount) > 200
ORDER BY revenue DESC;</textarea>
  </div>
</div>

## Key Takeaways

- Aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) reduce many rows to one summary value.
- `GROUP BY` applies those functions per group rather than across the whole table.
- Every non-aggregate column in `SELECT` must appear in `GROUP BY`.
- Use `WHERE` to filter rows before grouping; use `HAVING` to filter groups after aggregation.
- The logical execution order — `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY` — explains why aggregate expressions are legal in `HAVING` and `ORDER BY` but not in `WHERE`.
