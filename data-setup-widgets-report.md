# SQL Widgets with `data-setup` — Comprehensive Report

**Scan date:** July 15, 2026
**Scope:** All HTML pages under `/pages/`  
**Total pages with `data-setup` widgets:** 249  
**Total widgets:** 272  
**Widgets with nearby real system view mention:** 13  

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total pages scanned (with `data-setup`) | 249 |
| Total `data-setup` textarea widgets | 272 |
| Widgets where nearby text mentions a *real* system view/table | 13 (4.8%) |
| Widgets with purely simulated tables | 259 (95.2%) |

---

## Pages with Real System View Mentions

These 13 pages mention actual database system views/tables (pg_stat_*, sys.*, v$, EXPLAIN, SHOW, etc.) in the vicinity of their `data-setup` widgets:

| # | File | Title | Widget # |
|---|---|---|---|
| 1 | 009-a-first-mental-model.html | A first mental model | 1 |
| 2 | 011-logical-structure-vs-physical-structure.html | Logical structure vs physical structure | 1 |
| 3 | 052-logical-plans.html | Logical plans | 1 |
| 4 | 056-rule-based-and-cost-based-planning.html | Rule-based and cost-based planning | 1 |
| 5 | 088-updates-and-fragmentation.html | Updates and fragmentation | 1 |
| 6 | 123-redo-and-undo.html | Redo and undo | 1 |
| 7 | 223-access-patterns-first.html | Access patterns first | 1 |
| 8 | 224-picking-the-right-indexes.html | Picking the right indexes | 1 |
| 9 | 232-point-in-time-recovery.html | Point-in-time recovery | 1 |
| 10 | 235-schema-migrations-in-production.html | Schema migrations in production | 1 |
| 11 | 251-start-from-workload-not-fashion.html | Start from workload, not fashion | 1 |
| 12 | 288-one-database-can-do-everything.html | One database can do everything | 1 |
| 13 | 295-what-to-build-for-practice.html | What to build for practice | 1 |

---

## Complete Per-Page Extraction

Due to volume (249 pages), the complete detailed extraction for each page (filename, title, data-setup, query, surrounding text, real-view flag) is available in the tool output file at:
`/Users/sonht/.local/share/opencode/tool-output/tool_f61b912e0001Gi2SW1VD17BHIU`

Below is the structure of data for each page in that file:

```
--- PAGE N ---
File: <filename>
Title: <page title>
  Widget 1:
  data-setup: <CREATE TABLE ... statements>
  Query: <the SQL in the textarea>
  Surrounding text: <paragraph text after widget div, up to 300 chars>
  Has real view mention: YES/no
```

---

## Key Observations

1. **95.2% of all widgets are purely simulated** — they create fake tables (orders, customers, accounts, employees, etc.) with hardcoded INSERTs rather than querying real database system catalogs.

2. **Only 13 pages (5.2% of pages)** have nearby text that references real system views/tables such as `pg_stat_*`, `information_schema`, `sys.*`, `v$`, `EXPLAIN`, or `SHOW`. Even in those 13 pages, the widgets themselves still use simulated data.

3. **The pattern is consistent across all chapters** — every widget uses `CREATE TABLE ... INSERT INTO ...` to seed a fake in-memory SQLite database, regardless of whether the page is about storage engines, query planning, replication, transactions, or any other topic.

4. **No widget queries a real system view** — even pages teaching PostgreSQL concepts (like `pg_locks`, `pg_stat_activity`) or Oracle concepts (like `dba_tables`) simulate these with user-defined tables rather than pointing the widget at the actual system catalogs. The exception is page 235 which simulates `pg_locks` explicitly in its data-setup.

5. **Potential replacement candidates:** Many pages could replace simulated tables with real system views or SQLite equivalents:
   - Storage/storage stats: `PRAGMA table_info(...)`, `PRAGMA index_list(...)`, `PRAGMA page_count`, `PRAGMA freelist_count`
   - Query planning: `EXPLAIN QUERY PLAN` output tables
   - Schema info: SQLite's `sqlite_master` table
   - Lock/isolation info: PostgreSQL `pg_locks`, MySQL `INFORMATION_SCHEMA.INNODB_TRX`
   - Replication: PostgreSQL `pg_stat_replication`, MySQL `SHOW REPLICA STATUS`
   - Metrics: PostgreSQL `pg_stat_user_tables`, `pg_statio_user_tables`
