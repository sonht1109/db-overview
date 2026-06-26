Every table you work with will have more rows than you want at any given moment. The `WHERE` clause is how you tell the database which rows to keep. It is the most frequently used part of a `SELECT` statement and the foundation for almost everything else in SQL.

## The Basic Shape

A `WHERE` clause sits between the `FROM` clause and any sorting or grouping you might add. The database evaluates the condition for every row in the table and returns only the rows where it is true.

```sql
SELECT column1, column2
FROM table_name
WHERE condition;
```

The condition is a **predicate** — an expression that evaluates to true, false, or NULL for each row. Rows where the predicate is true pass through; all others are discarded.

### Comparison Operators

The most common predicates use the standard comparison operators:

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equal to | `status = 'active'` |
| `<>` or `!=` | Not equal to | `status <> 'deleted'` |
| `<` | Less than | `price < 10.00` |
| `>` | Greater than | `age > 18` |
| `<=` | Less than or equal | `score <= 100` |
| `>=` | Greater than or equal | `quantity >= 1` |

> **Note:** SQL uses a single `=` for equality tests, not `==`. This trips up programmers coming from most other languages.

## Combining Conditions with AND, OR, NOT

You can combine multiple predicates using logical operators. `AND` requires both sides to be true; `OR` requires at least one side to be true; `NOT` inverts the result.

```sql
-- Rows where both conditions are true
SELECT * FROM orders WHERE amount > 100 AND status = 'shipped';

-- Rows where either condition is true
SELECT * FROM products WHERE category = 'Books' OR category = 'Music';

-- Rows where the condition is false
SELECT * FROM users WHERE NOT is_suspended;
```

When you mix `AND` and `OR` in the same clause, use parentheses to make your intent explicit. `AND` binds more tightly than `OR` by default, which can produce surprising results if you rely on precedence alone.

```sql
-- Means: shipped orders over $100 OR any cancelled order
SELECT * FROM orders
WHERE amount > 100 AND status = 'shipped'
   OR status = 'cancelled';

-- Parentheses make it unambiguous
SELECT * FROM orders
WHERE (amount > 100 OR status = 'cancelled')
  AND customer_id = 42;
```

## Handy Shorthand Predicates

SQL provides several operators that keep common patterns concise.

**`BETWEEN`** tests whether a value falls within an inclusive range:

```sql
SELECT * FROM products WHERE price BETWEEN 10 AND 50;
-- Equivalent to: price >= 10 AND price <= 50
```

**`IN`** tests membership in a list of values:

```sql
SELECT * FROM orders WHERE status IN ('pending', 'processing', 'shipped');
-- Equivalent to: status = 'pending' OR status = 'processing' OR status = 'shipped'
```

**`LIKE`** matches text patterns. The `%` wildcard matches any sequence of characters; `_` matches exactly one character:

```sql
SELECT * FROM customers WHERE email LIKE '%@example.com';
SELECT * FROM products WHERE sku LIKE 'BOOK-___';
```

**`IS NULL` / `IS NOT NULL`** tests for missing values. You cannot use `= NULL` — NULL is never equal to anything, including itself. Always use `IS NULL`:

```sql
SELECT * FROM orders WHERE shipped_at IS NULL;  -- unshipped orders
```

## Try It Yourself

The widget below has a small `orders` table. The default query finds all paid orders over $50. Try modifying it — use `IN` to filter by multiple statuses, try `BETWEEN` on the amount, or find orders where `note` is `NULL`.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · WHERE Filters</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, note TEXT); INSERT INTO orders VALUES (1, 'Alice', 120.00, 'paid', NULL); INSERT INTO orders VALUES (2, 'Bob', 45.50, 'pending', 'Rush delivery'); INSERT INTO orders VALUES (3, 'Carol', 200.00, 'paid', 'Gift wrap'); INSERT INTO orders VALUES (4, 'David', 75.00, 'cancelled', NULL); INSERT INTO orders VALUES (5, 'Elena', 15.00, 'paid', NULL); INSERT INTO orders VALUES (6, 'Frank', 90.00, 'pending', NULL); INSERT INTO orders VALUES (7, 'Grace', 310.00, 'paid', 'Corporate account');">SELECT id, customer, amount, status
FROM orders
WHERE status = 'paid'
  AND amount > 50
ORDER BY amount DESC;</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Why does WHERE note = NULL return no rows?</summary><div class="reveal-body">NULL represents an unknown value. In SQL, any comparison with NULL — including <code>NULL = NULL</code> — evaluates to NULL, not true. The database discards rows where the predicate is NULL just as it discards rows where the predicate is false. To test for NULL, always use <code>IS NULL</code> or <code>IS NOT NULL</code>. This behavior follows directly from the three-valued logic (true / false / unknown) that underlies SQL's handling of missing data.</div></details>
