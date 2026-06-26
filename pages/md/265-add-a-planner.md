The parser hands us an AST — a tidy description of what the query wants. But the AST does not say how to get it. Should the engine scan every row? Use the salary index? Use the name index? Choosing the best physical strategy is the job of the **query planner** (also called the optimizer in larger systems). Even our tiny engine benefits from one: the difference between a full scan and an index lookup is often two orders of magnitude in latency.

## The Planner's Job

The planner sits between the parser and the executor. It takes an AST and produces a **plan** — a description of which physical operations to perform and in what order. In our toy, a plan is just a dict:

```python
# Possible plans
{"op": "SeqScan", "table": "employees", "predicate": ...}
{"op": "IndexLookup", "table": "employees",
 "index": "idx_salary", "key": 80000, "cmp": ">"}
```

The executor reads the plan and dispatches to the appropriate engine function.

## A Rule-Based Planner

Real databases use cost-based planners that estimate row counts and I/O costs. Our toy uses a simpler **rule-based** approach: if there is an index on the filtered column, use it; otherwise fall back to a sequential scan.

```python
def plan(
    ast: dict,
    available_indexes: dict[str, dict],   # {col_name: index_obj}
) -> dict:
    """Return the cheapest plan we can find for this AST."""
    assert ast["type"] == "SELECT"

    where = ast["where"]
    if where is None:
        return {"op": "SeqScan", "table": ast["table"],
                "predicate": None, "columns": ast["columns"]}

    col = where["col"].lower()
    if col in available_indexes:
        return {
            "op":      "IndexLookup",
            "table":   ast["table"],
            "index":   col,
            "cmp":     where["op"],
            "key":     where["val"],
            "columns": ast["columns"],
        }

    # No useful index — full scan with predicate
    return {
        "op":        "SeqScan",
        "table":     ast["table"],
        "predicate": where,
        "columns":   ast["columns"],
    }
```

## The Executor

The executor interprets the plan:

```python
def execute_plan(
    plan: dict,
    tables: dict,
    indexes: dict,
) -> list[dict]:
    op = plan["op"]

    if op == "SeqScan":
        pred = plan["predicate"]
        ops  = {">": lambda a,b: a>b, "<": lambda a,b: a<b,
                "=": lambda a,b: a==b, ">=": lambda a,b: a>=b,
                "<=": lambda a,b: a<=b}
        def match(row):
            if not pred:
                return True
            return ops[pred["op"]](row[pred["col"].lower()], pred["val"])
        rows = scan(tables[plan["table"]], match)

    elif op == "IndexLookup":
        idx      = indexes[plan["table"]][plan["index"]]
        cmp_fn   = {">": lambda a,b: a>b, "=": lambda a,b: a==b}
        row_nums = [rn for k, rns in idx.items()
                    if cmp_fn[plan["cmp"]](k, plan["key"])
                    for rn in rns]
        rows = (tables[plan["table"]].read_row(n) for n in row_nums)

    cols = plan["columns"]
    if cols == ["*"]:
        return list(rows)
    return [{c.lower(): r[c.lower()] for c in cols} for r in rows]
```

<figure class="diagram">
<svg viewBox="0 0 660 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Planner sits between the AST and the executor, choosing SeqScan or IndexLookup based on available indexes">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arrm" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- AST -->
  <rect x="10" y="70" width="110" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="65" y="93" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">AST</text>
  <text x="65" y="110" text-anchor="middle" font-size="10" fill="var(--muted)">WHERE salary</text>
  <text x="65" y="123" text-anchor="middle" font-size="10" fill="var(--muted)">&gt; 80000</text>

  <!-- Arrow to planner -->
  <line x1="122" y1="100" x2="168" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Planner box -->
  <rect x="170" y="60" width="140" height="80" rx="6" fill="var(--accent)" opacity="0.1" stroke="var(--accent)" stroke-width="2"/>
  <text x="240" y="85" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Planner</text>
  <text x="240" y="103" text-anchor="middle" font-size="10" fill="var(--muted)">index on salary?</text>
  <text x="240" y="118" text-anchor="middle" font-size="10" fill="var(--accent)">YES → IndexLookup</text>
  <text x="240" y="131" text-anchor="middle" font-size="10" fill="var(--muted)">NO  → SeqScan</text>

  <!-- Arrow to executor -->
  <line x1="312" y1="100" x2="358" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Executor box -->
  <rect x="360" y="70" width="130" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="425" y="93" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Executor</text>
  <text x="425" y="110" text-anchor="middle" font-size="10" fill="var(--muted)">runs the plan</text>
  <text x="425" y="123" text-anchor="middle" font-size="10" fill="var(--muted)">reads rows</text>

  <!-- Arrow to result -->
  <line x1="492" y1="100" x2="538" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Result box -->
  <rect x="540" y="75" width="110" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="595" y="97" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Result rows</text>
  <text x="595" y="113" text-anchor="middle" font-size="10" fill="var(--muted)">[Carol, Eve]</text>

  <!-- Catalog input -->
  <rect x="170" y="170" width="140" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="240" y="188" text-anchor="middle" font-size="10" fill="var(--text)">Index catalog</text>
  <text x="240" y="202" text-anchor="middle" font-size="10" fill="var(--muted)">{salary: SortedIndex}</text>
  <line x1="240" y1="168" x2="240" y2="142" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrm)"/>
</svg>
<figcaption>The planner inspects the index catalog, picks SeqScan or IndexLookup, and hands a plan dict to the executor.</figcaption>
</figure>

## Full Pipeline

```python
# One-liner to run a SQL query through the full stack:
def run(sql: str, tables, indexes):
    ast  = parse(sql)
    p    = plan(ast, indexes.get(ast.get("table",""), {}))
    return execute_plan(p, tables, indexes)

results = run("SELECT name FROM employees WHERE salary > 80000",
              tables, indexes)
# Plan chosen: IndexLookup on salary
# → [{"name": "Carol"}, {"name": "Eve"}]
```

## Why Cost-Based Planning Matters

Our rule-based planner is correct but naive. Suppose we have:

- 1 000 000 employees
- An index on `salary`
- A query `WHERE salary > 1`

The salary index returns 999 999 row numbers — almost the entire table. It is actually faster to do a sequential scan than to follow 999 999 random index pointers. A **cost-based planner** estimates the selectivity of the predicate (fraction of rows returned) and picks SeqScan when the index would fetch more than ~10–20% of rows.

PostgreSQL's planner stores column statistics (histograms, most-common-values) in `pg_statistic` and uses them to estimate row counts. Our toy skips all of this, but understanding why the estimates matter is half the battle.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Query Plans</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL, salary INTEGER NOT NULL); INSERT INTO employees VALUES (1,'Alice',30,70000),(2,'Bob',25,55000),(3,'Carol',34,92000),(4,'Dave',28,61000),(5,'Eve',40,110000); CREATE INDEX idx_salary ON employees(salary);">-- See which plan SQLite chooses:
EXPLAIN QUERY PLAN
SELECT name FROM employees WHERE salary &gt; 80000;

-- Force a full scan by removing usability of the index:
-- EXPLAIN QUERY PLAN SELECT name FROM employees WHERE salary + 0 &gt; 80000;

-- Index used for equality:
-- EXPLAIN QUERY PLAN SELECT * FROM employees WHERE salary = 70000;</textarea>
  </div>
</div>

## Key Takeaways

- The **planner** separates *what* (the AST) from *how* (the physical plan), enabling the same SQL to be executed differently depending on available indexes and data statistics.
- A **rule-based planner** is simple: use an index if one exists, otherwise scan. Correct but not always optimal.
- A **cost-based planner** estimates I/O and CPU cost per plan and picks the cheapest — essential once tables are large and multi-table joins appear.
- The full stack — `parse → plan → execute` — mirrors the architecture of PostgreSQL, MySQL, and SQLite almost exactly, just at radically smaller scale.
- Next we add **transactions**, so that multiple operations on the engine are atomic.
