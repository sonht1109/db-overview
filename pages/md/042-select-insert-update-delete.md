SQL gives you four workhorses for manipulating data: `SELECT` to read it, `INSERT` to add it, `UPDATE` to change it, and `DELETE` to remove it. Together they form the core of **Data Manipulation Language (DML)** — the part of SQL you will use every single day.

## SELECT — Reading Data

`SELECT` is the most-used statement in SQL. At minimum it needs two clauses: what columns to fetch, and which table to fetch from.

```sql
SELECT first_name, last_name
FROM employees;
```

Add `WHERE` to filter rows, `ORDER BY` to sort, and `LIMIT` to cap the result:

```sql
SELECT first_name, last_name, salary
FROM employees
WHERE department = 'Engineering'
ORDER BY salary DESC
LIMIT 5;
```

You can also compute expressions inline — `salary * 1.10 AS new_salary`, `COUNT(*)`, `AVG(salary)` — but those topics get their own chapter. For now, remember the skeleton:

```
SELECT  <columns>
FROM    <table>
WHERE   <condition>   -- optional
ORDER BY <column>     -- optional
LIMIT   <n>;          -- optional
```

> **Note:** `SELECT *` fetches every column. It is handy for exploration but avoid it in production code — it breaks silently when a schema changes and often pulls more data than needed.

Try it yourself. The widget below pre-loads a small `employees` table. Run the default query, then try changing the `WHERE` clause or sorting by a different column.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · SELECT basics</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE employees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, department TEXT, salary INTEGER); INSERT INTO employees VALUES (1,'Ada','Lovelace','Engineering',95000); INSERT INTO employees VALUES (2,'Grace','Hopper','Engineering',105000); INSERT INTO employees VALUES (3,'Alan','Turing','Research',98000); INSERT INTO employees VALUES (4,'Margaret','Hamilton','Engineering',110000); INSERT INTO employees VALUES (5,'Claude','Shannon','Research',92000);">SELECT first_name, last_name, salary
FROM employees
WHERE department = 'Engineering'
ORDER BY salary DESC;</textarea>
  </div>
</div>

## INSERT — Adding Rows

`INSERT INTO` appends one or more new rows to a table. Always name your columns explicitly — it makes the statement resilient to future schema changes and far easier to read.

```sql
INSERT INTO employees (first_name, last_name, department, salary)
VALUES ('Linus', 'Torvalds', 'Engineering', 120000);
```

You can insert multiple rows in a single statement by stacking `VALUES` tuples:

```sql
INSERT INTO employees (first_name, last_name, department, salary)
VALUES
  ('Tim',  'Berners-Lee', 'Research',    115000),
  ('Radia', 'Perlman',    'Engineering', 108000);
```

> **Note:** If a column has a default value (like an auto-increment primary key), you can omit it from the column list and the database fills it in for you.

## UPDATE — Changing Existing Rows

`UPDATE` modifies rows that already exist. The `SET` clause names each column and its new value; `WHERE` selects which rows are affected.

```sql
UPDATE employees
SET salary = 102000
WHERE id = 3;
```

You can update multiple columns in one statement:

```sql
UPDATE employees
SET department = 'AI Research', salary = salary * 1.15
WHERE department = 'Research';
```

> **Warning:** An `UPDATE` without a `WHERE` clause touches **every row in the table**. Always double-check your filter before running an update in production — or wrap it in a transaction so you can roll back if something goes wrong.

## DELETE — Removing Rows

`DELETE FROM` removes rows that match the `WHERE` condition.

```sql
DELETE FROM employees
WHERE id = 5;
```

Like `UPDATE`, a `DELETE` with no `WHERE` clause wipes the entire table. If you actually want to empty a table, most engines offer `TRUNCATE` for that purpose (faster and explicit about the intent). In SQLite, plain `DELETE FROM employees;` does the job.

The widget below lets you experiment with all four statements on a fresh copy of the table. Try inserting a new employee, updating a salary, then deleting a row — and use `SELECT * FROM employees;` after each step to see the result.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · INSERT / UPDATE / DELETE</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE employees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, department TEXT, salary INTEGER); INSERT INTO employees VALUES (1,'Ada','Lovelace','Engineering',95000); INSERT INTO employees VALUES (2,'Grace','Hopper','Engineering',105000); INSERT INTO employees VALUES (3,'Alan','Turing','Research',98000); INSERT INTO employees VALUES (4,'Margaret','Hamilton','Engineering',110000); INSERT INTO employees VALUES (5,'Claude','Shannon','Research',92000);">-- 1. Add a new employee
INSERT INTO employees (first_name, last_name, department, salary)
VALUES ('Linus', 'Torvalds', 'Engineering', 120000);

-- 2. Give Research a 10% raise
UPDATE employees
SET salary = salary * 1.10
WHERE department = 'Research';

-- 3. Remove one row
DELETE FROM employees WHERE id = 5;

-- 4. See the result
SELECT * FROM employees;</textarea>
  </div>
</div>

## Putting It Together

| Statement | Purpose | Danger zone |
|-----------|---------|-------------|
| `SELECT` | Read rows | — |
| `INSERT` | Add new rows | Violating constraints (duplicate key, NOT NULL) |
| `UPDATE` | Change existing rows | Missing `WHERE` → all rows changed |
| `DELETE` | Remove rows | Missing `WHERE` → all rows deleted |

These four statements are deliberately simple on their own. Their real power emerges when you combine them with `JOIN`, subqueries, transactions, and constraints — all of which the following chapters cover in depth.
