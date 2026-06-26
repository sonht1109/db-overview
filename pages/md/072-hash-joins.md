The previous page showed that a nested loop join without indexes costs O(M × N) — a problem when both tables are large. The **hash join** is the standard remedy. It is the go-to algorithm for equi-joins (joins on `=`) on large, unindexed data, and it appears in virtually every major database engine: PostgreSQL, MySQL, SQL Server, Oracle, DuckDB, and more.

## The Two-Phase Algorithm

A hash join works in two distinct phases.

### Phase 1 — Build

Pick the **smaller** of the two tables (called the **build input**). Scan it once and insert every row into an **in-memory hash table**, keyed on the join column.

```
hash_table = {}
for each row R in the build table:
    key = R[join_column]
    hash_table[key].append(R)
```

This is O(N) work, where N is the number of rows in the build table.

### Phase 2 — Probe

Scan the **larger** table (the **probe input**) once. For each row, compute the same hash and look up the key in the hash table. Every hit produces an output row.

```
for each row S in the probe table:
    key = S[join_column]
    for each matching R in hash_table[key]:
        emit (R, S)
```

This is O(M) work for the scan, plus O(1) average per lookup.

**Total cost: O(M + N)** — linear in the combined size of both tables, compared to O(M × N) for an unindexed nested loop.

## Comparing the Algorithms

| Property | Nested Loop (no index) | Hash Join |
|---|---|---|
| Time complexity | O(M × N) | O(M + N) |
| Memory required | Very low | Proportional to build table |
| Requires sorted input? | No | No |
| Works on non-equi joins? | Yes | No (equi-joins only) |
| Best when… | Inner table is small or indexed | Both tables are large, unindexed |

> **Note:** Hash joins only work for equality conditions (`a.id = b.id`). For range or inequality joins (`a.value < b.value`), the engine must fall back to a nested loop or use a sort-merge join.

## What Happens When Memory Runs Out?

The build phase loads the smaller table into memory. If that table is too large to fit, the engine spills to disk using a technique called **grace hashing**: it partitions both tables into buckets using a first hash function, writes each bucket to a temporary file, then processes bucket pairs one at a time. The on-disk work adds cost, but the algorithm remains correct.

> **Note:** You can influence this in PostgreSQL by adjusting `work_mem`. A larger `work_mem` lets the build table fit in RAM, avoiding spill and dramatically speeding up hash joins on large datasets.

## Try It Live

The widget below sets up two tables — `products` and `order_lines` — and runs an equi-join. SQLite's query planner is simple and will often choose a nested loop on small data, but the SQL and result are identical to what a hash join would produce. Focus on reading the query and understanding the equality condition the hash join would key on.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Hash join scenario</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (product_id INTEGER, name TEXT, category TEXT); INSERT INTO products VALUES (1, 'Notebook', 'Stationery'), (2, 'Pen', 'Stationery'), (3, 'Desk Lamp', 'Electronics'), (4, 'USB Hub', 'Electronics'), (5, 'Eraser', 'Stationery'); CREATE TABLE order_lines (line_id INTEGER, product_id INTEGER, qty INTEGER, unit_price REAL); INSERT INTO order_lines VALUES (101, 3, 2, 29.99), (102, 1, 5, 4.49), (103, 4, 1, 19.99), (104, 2, 10, 0.99), (105, 3, 1, 29.99), (106, 5, 3, 0.49);">-- A classic equi-join — the equality on product_id is what a
-- hash join keys on. Try changing the WHERE clause to filter
-- by category and observe which rows appear.
SELECT p.name, p.category, ol.qty, ol.unit_price,
       ol.qty * ol.unit_price AS line_total
FROM order_lines AS ol
JOIN products AS p ON ol.product_id = p.product_id
ORDER BY line_total DESC;</textarea>
  </div>
</div>

Now try aggregating — hash joins feed naturally into `GROUP BY` since both operations batch rows by a key:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Join then aggregate</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (product_id INTEGER, name TEXT, category TEXT); INSERT INTO products VALUES (1, 'Notebook', 'Stationery'), (2, 'Pen', 'Stationery'), (3, 'Desk Lamp', 'Electronics'), (4, 'USB Hub', 'Electronics'), (5, 'Eraser', 'Stationery'); CREATE TABLE order_lines (line_id INTEGER, product_id INTEGER, qty INTEGER, unit_price REAL); INSERT INTO order_lines VALUES (101, 3, 2, 29.99), (102, 1, 5, 4.49), (103, 4, 1, 19.99), (104, 2, 10, 0.99), (105, 3, 1, 29.99), (106, 5, 3, 0.49);">-- Revenue by category, joined then grouped
SELECT p.category,
       COUNT(*) AS num_lines,
       SUM(ol.qty * ol.unit_price) AS total_revenue
FROM order_lines AS ol
JOIN products AS p ON ol.product_id = p.product_id
GROUP BY p.category
ORDER BY total_revenue DESC;</textarea>
  </div>
</div>

## Key Takeaways

- A hash join has two phases: **build** a hash table from the smaller table, then **probe** it with the larger table.
- Overall cost is **O(M + N)** — a massive improvement over an unindexed nested loop when both tables are large.
- Hash joins require the join condition to be an **equality** (`=`); non-equi joins cannot use this algorithm.
- Memory is the main resource constraint. When the build table overflows RAM, the engine spills to disk via grace hashing, which is slower but still correct.
- The query planner chooses the algorithm automatically. If you see a hash join in `EXPLAIN` output, it usually means the planner found no useful index and decided linear-scan cost was acceptable.
