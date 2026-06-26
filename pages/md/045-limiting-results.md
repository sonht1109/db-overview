Real tables are rarely small. A production database might hold millions of orders, log entries, or user accounts. Asking for "all rows" is almost never what you actually want — and often what you *cannot* afford. SQL gives you two closely related clauses for controlling exactly how many rows come back: `LIMIT` and `OFFSET`.

## LIMIT: Take Only What You Need

`LIMIT n` tells the database to stop returning rows after the first `n` it finds. Everything else is discarded before the result even reaches your application.

```sql
SELECT name, salary
FROM employee
ORDER BY salary DESC
LIMIT 5;
```

This returns only the five highest-paid employees. Without `LIMIT`, the full table comes back. With it, the database can often short-circuit its work once the quota is met.

> **Note:** `LIMIT` without `ORDER BY` returns *some* `n` rows in an unspecified order — the engine is free to pick whichever rows are cheapest to retrieve. Always pair `LIMIT` with `ORDER BY` when the particular rows matter, not just the count.

## OFFSET: Skipping Ahead

`OFFSET m` tells the database to skip the first `m` rows before it starts counting toward your limit. Together, `LIMIT` and `OFFSET` let you page through a large result set in chunks.

```sql
-- Page 1: rows 1–10
SELECT name, salary FROM employee ORDER BY salary DESC LIMIT 10 OFFSET 0;

-- Page 2: rows 11–20
SELECT name, salary FROM employee ORDER BY salary DESC LIMIT 10 OFFSET 10;

-- Page 3: rows 21–30
SELECT name, salary FROM employee ORDER BY salary DESC LIMIT 10 OFFSET 20;
```

The pattern is: `OFFSET = (page_number - 1) * page_size`. This is the classic **offset pagination** technique used in countless APIs and admin dashboards.

### The Hidden Cost of Large Offsets

Offset pagination feels intuitive, but it has a real performance trap: the database must still scan and discard all the skipped rows on every query. Jumping to page 500 with `OFFSET 4990` forces the engine to touch nearly 5 000 rows just to throw them away.

| Approach | Works well when… | Watch out when… |
|---|---|---|
| `LIMIT` only | You just want the top-N results | You never need to page further |
| `LIMIT` + `OFFSET` | Data is small or offset is modest | Offset grows large (slow scans) |
| Keyset / cursor pagination | Data is large, offset grows big | You need arbitrary page jumps |

For large datasets, **keyset pagination** (also called cursor-based pagination) avoids the problem by filtering on the last-seen value instead of counting rows:

```sql
-- After seeing the last row had id = 342:
SELECT id, name, salary
FROM employee
WHERE id > 342
ORDER BY id
LIMIT 10;
```

This is always fast because an index on `id` goes straight to the right starting point.

## Try It Yourself

The widget below seeds a small `product` table. Run the default query, then experiment: change the `LIMIT`, add an `OFFSET`, try different `ORDER BY` columns, or remove `ORDER BY` entirely to see how the result becomes non-deterministic.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · LIMIT &amp; OFFSET</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE product (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL); INSERT INTO product VALUES (1, 'Wireless Mouse', 'Electronics', 29.99); INSERT INTO product VALUES (2, 'Standing Desk', 'Furniture', 349.00); INSERT INTO product VALUES (3, 'USB-C Hub', 'Electronics', 49.95); INSERT INTO product VALUES (4, 'Notebook', 'Stationery', 4.50); INSERT INTO product VALUES (5, 'Monitor Arm', 'Furniture', 89.00); INSERT INTO product VALUES (6, 'Mechanical Keyboard', 'Electronics', 119.00); INSERT INTO product VALUES (7, 'Ballpoint Pens (12pk)', 'Stationery', 6.99); INSERT INTO product VALUES (8, 'Desk Lamp', 'Furniture', 54.00); INSERT INTO product VALUES (9, 'Webcam', 'Electronics', 79.99); INSERT INTO product VALUES (10, 'Sticky Notes', 'Stationery', 3.25); INSERT INTO product VALUES (11, 'Laptop Stand', 'Electronics', 39.00); INSERT INTO product VALUES (12, 'Whiteboard', 'Furniture', 129.99);">-- Top 5 most expensive products
SELECT id, name, category, price
FROM product
ORDER BY price DESC
LIMIT 5;</textarea>
  </div>
</div>

Try changing `LIMIT 5` to `LIMIT 5 OFFSET 5` to fetch the next page. Then try `ORDER BY name` to see alphabetical paging instead.

<details class="reveal"><summary>Reveal: What does LIMIT 0 return?</summary><div class="reveal-body"><code>LIMIT 0</code> returns zero rows — an empty result set with the correct column headers. This is occasionally useful for probing a query's shape (what columns does it return?) without paying the cost of fetching actual data.</div></details>
