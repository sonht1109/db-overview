When you join two tables, the number of rows in the result is rarely what intuition suggests. Understanding **cardinality** — how many rows a join or aggregation produces, and why — is the single most useful mental model for reasoning about query performance and correctness.

## What "Cardinality" Means

In database contexts, *cardinality* has two related meanings:

1. **Column cardinality** — how many distinct values a column holds. A `status` column with three possible values (`active`, `inactive`, `pending`) has low cardinality. A `user_id` column with millions of unique values has high cardinality.
2. **Relationship cardinality** — how many rows from one table match rows in another. This is the one that bites people in joins.

The relationship types you met in Chapter 4 map directly to row-count behaviour:

| Relationship | Example | Typical result row count |
|---|---|---|
| one-to-one | user ↔ profile | same as input |
| one-to-many | order → order_lines | grows (multiplied) |
| many-to-many | student ↔ course | can explode |

> **Note:** A join does not cap rows at the size of either input table. If 1 order has 10 lines, joining orders to order_lines produces 10 rows for that order — not 1.

## Row Multiplication: The Classic Trap

The most common surprise is a **fan-out join** — joining a one-to-many relationship when you only wanted summary data.

Suppose you have orders and their line items, and you want the total revenue per customer. If you join first and aggregate second, every order row is duplicated once per line item before the `SUM` runs — which gives the right answer *here*, but only because aggregation collapses it back. Add a second one-to-many join (say, payments) and you can double-count badly.

Try this widget to see fan-out in action. Notice how joining before aggregating inflates intermediate rows:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Fan-out join</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT, amount REAL); INSERT INTO orders VALUES (1,'Alice',100),(2,'Bob',200),(3,'Alice',50); CREATE TABLE line_items (item_id INTEGER PRIMARY KEY, order_id INTEGER, product TEXT, qty INTEGER); INSERT INTO line_items VALUES (1,1,'Widget',2),(2,1,'Gadget',1),(3,2,'Widget',5),(4,3,'Gadget',3);"> -- How many rows does the join produce?
-- Compare this to the number of orders (3).
SELECT o.order_id, o.customer, o.amount, li.product, li.qty
FROM orders o
JOIN line_items li ON o.order_id = li.order_id
ORDER BY o.order_id;</textarea>
  </div>
</div>

Run it, count the rows, then modify the query to group by `customer` and sum `o.amount` — you will see why that double-counts Alice's order 1 (it appears twice, once per line item).

## Counting Rows Correctly

SQLite (and every SQL engine) gives you `COUNT(*)` for total rows and `COUNT(DISTINCT col)` for unique values. These are not the same thing, and mixing them up is a frequent source of bugs.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · COUNT variants</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (event_id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT); INSERT INTO events VALUES (1,101,'click'),(2,101,'view'),(3,102,'click'),(4,103,'view'),(5,101,'purchase'),(6,102,'purchase');"> -- Total events vs unique users vs events per user
SELECT
  COUNT(*)                  AS total_events,
  COUNT(DISTINCT user_id)   AS unique_users,
  COUNT(*) * 1.0 / COUNT(DISTINCT user_id) AS avg_events_per_user
FROM events;</textarea>
  </div>
</div>

Edit the query to add `GROUP BY user_id` and watch how `COUNT(*)` changes meaning — it now counts events *within each group*, not across the whole table.

## How the Planner Uses Cardinality Estimates

The query planner you read about in Chapter 6 relies on cardinality estimates to pick join algorithms and join order. It maintains **statistics** — histograms of value distributions, row counts per table — and uses them to guess how many rows each plan step will produce.

A bad estimate cascades: if the planner thinks a join returns 100 rows but it actually returns 100,000, it may choose a nested-loop join that is catastrophically slow. That is why commands like `ANALYZE` (SQLite/Postgres) exist — they refresh statistics so estimates stay accurate as data grows.

> **Key takeaway:** Cardinality is not just an academic concept. It determines result correctness when you aggregate across joins, and it drives every performance decision the planner makes. Always ask "how many rows will this join produce?" before you write the `GROUP BY`.
