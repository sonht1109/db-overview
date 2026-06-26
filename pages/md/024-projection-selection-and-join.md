The relational model is not just a way to store data — it defines a set of **operations** for querying it. Three of those operations are the backbone of almost every query you will ever write: **selection** (filter rows), **projection** (pick columns), and **join** (combine tables). Understanding what each one does, and why, makes SQL feel inevitable rather than arbitrary.

## Selection: Filter Rows

**Selection** takes a relation and returns only the tuples that satisfy a given condition. The result has the same columns as the input — you haven't changed the shape, just reduced the number of rows.

In SQL, selection is expressed with a `WHERE` clause:

```sql
SELECT * FROM employee
WHERE department = 'Engineering';
```

That query returns every column (`*`) but only the rows where `department` equals `'Engineering'`. The predicate can be as simple as a single equality check or as complex as a combination of `AND`, `OR`, `NOT`, range comparisons, and pattern matches.

> **Note:** Formal relational algebra uses the Greek letter sigma (σ) for selection: σ_condition(R) means "return all tuples in R that satisfy the condition." SQL's `WHERE` clause is that operation.

## Projection: Pick Columns

**Projection** takes a relation and returns only the columns you specify. Every row survives, but each row is narrowed to the chosen attributes.

```sql
SELECT name, salary FROM employee;
```

This returns all rows, but strips every column except `name` and `salary`. In formal notation, projection uses pi (π): π_name,salary(employee).

Projection is how you avoid selecting more data than you need — a habit that pays off in performance and clarity. It also matters when you're combining operations: projecting to a smaller set of columns before a join reduces the amount of data the engine has to shuffle around.

> **Note:** In pure relational algebra, projecting can reduce the number of rows if two tuples become identical after the unwanted columns are removed (since a relation is a set). SQL does **not** remove duplicates automatically — you must add `DISTINCT` if you want that behavior.

## Join: Combine Tables

A **join** combines two relations by matching tuples from each based on a condition, producing a new relation. It is the operation that makes normalization practical: you can split data across multiple tables and reassemble it on demand.

The most common form is the **inner join**, which returns only the tuples where the join condition is satisfied in both tables:

```sql
SELECT e.name, d.location
FROM employee e
INNER JOIN department d ON e.dept_id = d.id;
```

Here `employee` and `department` are matched wherever `e.dept_id` equals `d.id`. Rows with no match on either side are dropped.

### Other Join Types

| Join type | What it returns |
|-----------|----------------|
| `INNER JOIN` | Only rows with a match in both tables |
| `LEFT JOIN` | All rows from the left table; NULLs where no match on the right |
| `RIGHT JOIN` | All rows from the right table; NULLs where no match on the left |
| `FULL OUTER JOIN` | All rows from both tables; NULLs where no match on either side |
| `CROSS JOIN` | Every combination of rows from both tables (the Cartesian product) |

The `CROSS JOIN` is rarely what you want in practice — two 1 000-row tables produce 1 000 000 result rows — but it is the mathematical foundation from which all other joins are derived: an inner join is a cross join with a filter applied.

## Putting It All Together

The real power comes from composing these operations. Selection, projection, and join are each closed over relations: each one takes relations as input and produces a relation as output, so you can chain them freely.

Try the widget below. The default query demonstrates all three operations at once: a join (two tables), a selection (`WHERE salary > 70000`), and a projection (named columns rather than `*`). Edit the query to explore — try removing the `WHERE` clause, changing the join condition, or adding more columns.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Selection, Projection &amp; Join</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE dept (id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL); INSERT INTO dept VALUES (1, 'Engineering', 'Austin'); INSERT INTO dept VALUES (2, 'Marketing', 'Chicago'); INSERT INTO dept VALUES (3, 'Finance', 'New York'); CREATE TABLE employee (id INTEGER PRIMARY KEY, name TEXT NOT NULL, dept_id INTEGER NOT NULL, salary INTEGER NOT NULL); INSERT INTO employee VALUES (1, 'Ada', 1, 95000); INSERT INTO employee VALUES (2, 'Brian', 2, 72000); INSERT INTO employee VALUES (3, 'Carmen', 1, 105000); INSERT INTO employee VALUES (4, 'David', 2, 68000); INSERT INTO employee VALUES (5, 'Elena', 3, 88000);">-- Join + selection + projection in one query
SELECT e.name, dept.name AS department, dept.location, e.salary
FROM employee e
INNER JOIN dept ON e.dept_id = dept.id
WHERE e.salary > 70000
ORDER BY e.salary DESC;</textarea>
  </div>
</div>

Now try a `LEFT JOIN` instead of `INNER JOIN` — you will not see any difference here because every employee has a matching department. To see the distinction, insert an employee with a `dept_id` that does not exist in `dept` (say, `dept_id = 99`) and compare the results of `INNER JOIN` versus `LEFT JOIN`.

<details class="reveal"><summary>Reveal: What happens if you omit the ON clause from a JOIN?</summary><div class="reveal-body">Without an <code>ON</code> clause, most SQL dialects treat it as a <strong>CROSS JOIN</strong> — every row from the left table is paired with every row from the right table. With 5 employees and 3 departments that produces 15 result rows, most of which are meaningless combinations. This is almost never what you want. Always specify your join condition explicitly to avoid accidental Cartesian products.</div></details>
