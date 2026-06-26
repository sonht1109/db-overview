Sometimes a single `SELECT` is not enough to answer a question. You might need to filter rows based on the result of another query, or break a complex problem into named steps before combining them. SQL gives you two tools for this: **subqueries** (queries nested inside another query) and **common table expressions**, or **CTEs** (named temporary result sets defined before the main query). Both let you compose queries from smaller, reusable pieces.

## Subqueries

A subquery is a `SELECT` statement nested inside another SQL statement, wrapped in parentheses. It runs first, and its result is used by the outer query.

**Scalar subquery** — returns a single value and can appear anywhere an expression is valid:

```sql
SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
```

**IN subquery** — returns a set of values for membership testing:

```sql
SELECT name
FROM employees
WHERE department_id IN (SELECT id FROM departments WHERE location = 'Berlin');
```

**Correlated subquery** — references columns from the outer query, so it re-executes once per outer row. Useful but can be slow on large tables:

```sql
SELECT name, salary
FROM employees e
WHERE salary = (
  SELECT MAX(salary)
  FROM employees
  WHERE department_id = e.department_id
);
```

> **Note:** Correlated subqueries are powerful but carry a performance cost. If you see one in production code, check whether a join or window function can replace it.

Try the widget below. It seeds a small `employees` table and runs a subquery to find everyone earning above the average salary. Edit the `WHERE` clause to experiment.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Subqueries</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, location TEXT); INSERT INTO departments VALUES (1, 'Engineering', 'Berlin'), (2, 'Sales', 'Paris'), (3, 'HR', 'Berlin'); CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, salary REAL); INSERT INTO employees VALUES (1, 'Alice', 1, 90000), (2, 'Bob', 1, 75000), (3, 'Carol', 2, 68000), (4, 'Dave', 2, 82000), (5, 'Eve', 3, 71000), (6, 'Frank', 3, 65000);">SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees)
ORDER BY salary DESC;</textarea>
  </div>
</div>

## Common Table Expressions (CTEs)

A CTE defines a named result set at the top of a query using the `WITH` keyword. You can then reference that name as if it were a table. CTEs make long queries dramatically easier to read and debug.

```sql
WITH berlin_departments AS (
  SELECT id
  FROM departments
  WHERE location = 'Berlin'
),
high_earners AS (
  SELECT name, salary, department_id
  FROM employees
  WHERE salary > 75000
)
SELECT h.name, h.salary, d.id AS dept_id
FROM high_earners h
JOIN berlin_departments d ON h.department_id = d.id;
```

Each CTE block is separated by a comma. The main `SELECT` follows after the last one. You can reference an earlier CTE inside a later one, which is how you build step-by-step transformations.

### Recursive CTEs

SQLite (and standard SQL) supports **recursive CTEs**, which let a CTE reference itself. This is the standard way to walk hierarchical data like org charts or bill-of-materials trees.

```sql
WITH RECURSIVE org AS (
  -- anchor: start at the CEO (no manager)
  SELECT id, name, manager_id, 0 AS depth
  FROM staff
  WHERE manager_id IS NULL

  UNION ALL

  -- recursive step: find direct reports
  SELECT s.id, s.name, s.manager_id, org.depth + 1
  FROM staff s
  JOIN org ON s.manager_id = org.id
)
SELECT depth, name FROM org ORDER BY depth, name;
```

The engine alternates between the anchor query and the recursive step until no new rows are produced.

## Subquery vs CTE — When to Use Which

| Situation | Better choice |
|---|---|
| Simple one-off filter or scalar value | Inline subquery |
| Same derived table referenced more than once | CTE |
| Multi-step transformation you want to name and read top-down | CTE |
| Walking a hierarchy or graph | Recursive CTE |
| Correlated per-row calculation | Correlated subquery (or window function) |

Neither tool is inherently faster than the other — most modern query optimizers treat them equivalently. The real benefit of CTEs is **readability**: they let you give meaningful names to intermediate steps, which makes queries far easier to review and maintain.

Try rewriting the subquery from the first widget as a CTE in the box below:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · CTEs</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, location TEXT); INSERT INTO departments VALUES (1, 'Engineering', 'Berlin'), (2, 'Sales', 'Paris'), (3, 'HR', 'Berlin'); CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, salary REAL); INSERT INTO employees VALUES (1, 'Alice', 1, 90000), (2, 'Bob', 1, 75000), (3, 'Carol', 2, 68000), (4, 'Dave', 2, 82000), (5, 'Eve', 3, 71000), (6, 'Frank', 3, 65000);">WITH avg_salary AS (
  SELECT AVG(salary) AS mean FROM employees
),
berlin_depts AS (
  SELECT id FROM departments WHERE location = 'Berlin'
)
SELECT e.name, e.salary
FROM employees e
JOIN berlin_depts d ON e.department_id = d.id
WHERE e.salary > (SELECT mean FROM avg_salary)
ORDER BY e.salary DESC;</textarea>
  </div>
</div>
