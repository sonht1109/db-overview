When you run a plain `SELECT`, the database engine returns rows in whatever order it finds convenient — usually the order they were written to disk. That order is **not guaranteed** and can change between queries. If you care about the sequence of results (and most of the time you do), you need `ORDER BY`.

## The Basic Syntax

Append `ORDER BY <column>` to your `SELECT` statement:

```sql
SELECT name, salary
FROM employees
ORDER BY salary;
```

By default the sort is **ascending** (`ASC`) — smallest to largest for numbers, earliest to latest for dates, and `A → Z` for text. Flip it with `DESC`:

```sql
SELECT name, salary
FROM employees
ORDER BY salary DESC;
```

> **Note:** `ORDER BY` always goes at the very end of a `SELECT` statement — after `WHERE`, `GROUP BY`, and `HAVING` if those clauses are present.

## Sorting by Multiple Columns

You can pass a comma-separated list of columns. The database sorts by the first column, then breaks ties using the second, and so on:

```sql
SELECT department, name, salary
FROM employees
ORDER BY department ASC, salary DESC;
```

Here every employee is grouped by department alphabetically, and within each department the highest earner appears first. Each column can have its own `ASC`/`DESC` direction.

| department | name    | salary |
|------------|---------|--------|
| Engineering | Alice  | 95000  |
| Engineering | Bob    | 82000  |
| Marketing   | Carol  | 78000  |
| Marketing   | Dave   | 71000  |

## Sorting by Position and Expressions

SQL also lets you refer to a column by its **position** in the `SELECT` list (counting from 1):

```sql
SELECT name, salary
FROM employees
ORDER BY 2 DESC;   -- same as ORDER BY salary DESC
```

This shortcut is handy in an interactive session but makes code harder to read when shared — prefer explicit column names in production queries.

You can also sort on an **expression** that does not appear in the `SELECT` list:

```sql
SELECT name, hire_date
FROM employees
ORDER BY LOWER(name);   -- case-insensitive alphabetical
```

SQLite and most databases evaluate the expression per-row just for ordering purposes.

## NULL Values and Sort Order

`NULL` means "unknown," so where does it sort? The answer varies by database:

- **SQLite and PostgreSQL** treat `NULL` as **larger than any non-NULL value**, so NULLs appear last with `ASC` and first with `DESC`.
- **MySQL** treats `NULL` as smaller than any non-NULL value — the opposite.

PostgreSQL lets you control this explicitly with `NULLS FIRST` or `NULLS LAST`. SQLite does not support that syntax, but you can work around it:

```sql
-- Push NULLs to the bottom in SQLite, even with DESC
ORDER BY (bonus IS NULL) ASC, bonus DESC;
```

> **Note:** Always test NULL behavior in your specific database if sort order around missing values matters for your application.

---

Try it yourself. The widget below seeds a small `products` table. Run the default query, then experiment: change `ASC` to `DESC`, add a second sort column, or try sorting by an expression like `LOWER(category)`.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · ORDER BY</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL, stock INTEGER); INSERT INTO products VALUES (1, 'Wireless Mouse', 'Electronics', 29.99, 150); INSERT INTO products VALUES (2, 'Mechanical Keyboard', 'Electronics', 89.99, 60); INSERT INTO products VALUES (3, 'Desk Lamp', 'Office', 34.99, 200); INSERT INTO products VALUES (4, 'Notebook', 'Stationery', 4.99, 500); INSERT INTO products VALUES (5, 'USB Hub', 'Electronics', 19.99, 80); INSERT INTO products VALUES (6, 'Stapler', 'Stationery', 9.99, 120); INSERT INTO products VALUES (7, 'Monitor Stand', 'Office', 49.99, 45); INSERT INTO products VALUES (8, 'Ballpoint Pens', 'Stationery', 2.99, 1000);">SELECT name, category, price
FROM products
ORDER BY category ASC, price DESC;</textarea>
  </div>
</div>

Once you are comfortable with ordering, the next topic introduces `LIMIT` and `OFFSET` — useful for paginating through sorted results one page at a time.
