When two tables are already sorted on the join key, combining them is surprisingly cheap: you walk both lists in lockstep, advancing the pointer on whichever side is behind. That is the core idea of a **merge join** — sometimes called a *sort-merge join* because the engine will sort the inputs first if they are not already ordered.

## How the Algorithm Works

Picture two sorted sequences of keys. The engine holds one pointer into each, starting at the top:

1. **Compare** the two current keys.
2. If they are equal, **emit** all matching row pairs, then advance both pointers (or hold one while scanning duplicates on the other side).
3. If the left key is smaller, **advance** the left pointer.
4. If the right key is smaller, **advance** the right pointer.
5. Stop when either pointer runs off the end.

Because both inputs are sorted, no row is ever revisited from the wrong direction. Each side is read exactly once, making the algorithm **O(N + M)** in the number of row comparisons — linear in the size of the inputs — once sorting is done.

> **Note:** The sort step itself is O(N log N). If an index already provides sorted order (a B-tree index on the join column is common), the engine skips the explicit sort and the whole join is linear.

### A concrete walk-through

Suppose you are joining `orders.customer_id` to `customers.id`, both sorted:

| Customers (sorted by id) | Orders (sorted by customer_id) |
|---|---|
| 1 · Alice | 1 · #101 |
| 2 · Bob | 1 · #102 |
| 3 · Carol | 3 · #103 |
| 5 · Dave | 5 · #104 |

Steps: match `1`→emit (Alice, #101) and (Alice, #102); advance orders pointer to `3`. Compare `2` vs `3` — left is smaller, skip Bob. Compare `3` vs `3` — emit (Carol, #103). Compare `5` vs `5` — emit (Dave, #104). Done. Bob is skipped because he has no orders; `4` never appears.

## When the Planner Chooses a Merge Join

The query optimizer picks a merge join when it expects the join to produce **many matching rows** and the inputs are large enough that a hash join's up-front memory cost is undesirable, or — crucially — when **both sides are already sorted**. Common triggers:

- The join columns are covered by B-tree indexes the planner can exploit.
- The query has an `ORDER BY` on the join key, so the sort is "free" (it satisfies two goals at once).
- The tables are large and available memory is limited: merge join streams data through rather than building an in-memory hash table.

Compared to a **nested-loop join** (O(N × M)), merge join wins on large, unsorted datasets once the sort cost is amortized. Compared to a **hash join**, merge join wins when inputs are pre-sorted but loses when they are not and memory is plentiful.

| Join type | Best when… | Memory use | Requires sorted input? |
|---|---|---|---|
| Nested loop | Small outer table or index on inner | Low | No |
| Hash join | Large unsorted inputs, plenty of RAM | High (hash table) | No |
| Merge join | Large inputs, sorted or index-covered | Low (streaming) | Yes (or pays sort cost) |

## Seeing It in Action

The widget below creates `customers` and `orders` tables already sorted by their join key. Run the query to see a straightforward inner join — then try adding an `ORDER BY` or changing to a `LEFT JOIN` to observe which customers appear even without orders.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Merge join example</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO customers VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Carol'), (5, 'Dave'); CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL); INSERT INTO orders VALUES (101, 1, 49.99), (102, 1, 19.50), (103, 3, 89.00), (104, 5, 5.75);">SELECT c.id, c.name, o.order_id, o.amount
FROM customers AS c
JOIN orders AS o ON c.id = o.customer_id
ORDER BY c.id;</textarea>
  </div>
</div>

Notice that Bob (id = 2) is absent — he has no matching orders. Switch `JOIN` to `LEFT JOIN` and Bob reappears with `NULL` in the order columns, which mirrors what a merge join must do when a left-side key has no match on the right.

## Duplicates and Skew

One subtlety: when many rows share the same key value, the merge join must **buffer** all rows from one side for that key to pair them with every row on the other side. If a single key has thousands of matches (a "skewed" distribution), memory pressure can spike. Most engines handle this by spilling to disk, but it is worth knowing — a merge join's O(N + M) guarantee assumes the number of output rows is manageable. High-cardinality joins on skewed data can turn a theoretically cheap algorithm into a slow one.

> **Note:** You rarely choose a join algorithm directly in SQL. You write the query; the planner decides. But understanding the mechanics lets you write queries and design indexes that *guide* the planner toward the fastest plan — for example, creating an index on a frequently joined foreign key so the merge join path is always available.
