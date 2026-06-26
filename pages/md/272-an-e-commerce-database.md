E-commerce is where database design gets serious. A typical online store must handle product catalogs with thousands of attributes, inventory that changes under concurrent load, orders that must never be lost, and pricing rules that defy simple column design. This case study traces through each of those challenges and lands on a schema you could actually ship.

## What the System Needs to Do

- Catalog: products with multiple variants (size/color), images, and categories.
- Inventory: per-variant stock counts, decremented atomically when an order is placed.
- Orders: line items, shipping address, payment status — append-only once placed.
- Pricing: base price on the product, optional sale prices with a validity window.

## Core Schema

```sql
CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id),
  name        TEXT    NOT NULL,
  description TEXT,
  base_price  INTEGER NOT NULL,  -- cents; never store money as REAL
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE product_variants (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku        TEXT    NOT NULL UNIQUE,
  attributes TEXT    NOT NULL,   -- JSON: {"color":"red","size":"M"}
  price_diff INTEGER NOT NULL DEFAULT 0  -- delta from base_price, in cents
);

CREATE TABLE inventory (
  variant_id  INTEGER PRIMARY KEY REFERENCES product_variants(id),
  quantity    INTEGER NOT NULL DEFAULT 0,
  reserved    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE price_overrides (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  price      INTEGER NOT NULL,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  status       TEXT NOT NULL DEFAULT 'pending',
  total_cents  INTEGER NOT NULL,
  placed_at    INTEGER NOT NULL,
  shipped_at   INTEGER,
  address_json TEXT NOT NULL  -- snapshot of shipping address
);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id),
  quantity    INTEGER NOT NULL,
  unit_price  INTEGER NOT NULL  -- price at time of purchase — never recalculate
);
```

### Money as Integer

Storing prices in **cents as integers** is a near-universal best practice. Floating-point arithmetic on decimals accumulates rounding error; 0.1 + 0.2 ≠ 0.3 in IEEE 754. With integers, $12.99 is 1299 — addition and comparison are exact.

### Snapshotting the Address

The shipping address is stored as a JSON blob on the order, not a foreign key to a `addresses` table. This is intentional: if a customer updates their address, historical orders must still show the address used at purchase time. The same logic applies to `unit_price` on order items — never recalculate it from the current product price.

<figure class="diagram">
<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="E-commerce schema: products have variants and inventory; orders contain order_items linked to variants; customers place orders">
  <defs>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- products -->
  <rect x="10" y="140" width="140" height="110" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="10" y="140" width="140" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="80" y="158" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">products</text>
  <text x="24" y="182" font-size="11" fill="var(--muted)">PK id</text>
  <text x="24" y="198" font-size="11" fill="var(--text)">name, description</text>
  <text x="24" y="214" font-size="11" fill="var(--text)">base_price (cents)</text>
  <text x="24" y="230" font-size="11" fill="var(--text)">FK category_id</text>

  <!-- product_variants -->
  <rect x="210" y="80" width="160" height="110" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="210" y="80" width="160" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="290" y="98" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">product_variants</text>
  <text x="224" y="122" font-size="11" fill="var(--muted)">PK id</text>
  <text x="224" y="138" font-size="11" fill="var(--text)">FK product_id</text>
  <text x="224" y="154" font-size="11" fill="var(--text)">sku UNIQUE</text>
  <text x="224" y="170" font-size="11" fill="var(--text)">attributes (JSON)</text>

  <!-- inventory -->
  <rect x="210" y="220" width="160" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="210" y="220" width="160" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="290" y="238" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">inventory</text>
  <text x="224" y="262" font-size="11" fill="var(--muted)">PK/FK variant_id</text>
  <text x="224" y="278" font-size="11" fill="var(--text)">quantity, reserved</text>

  <!-- orders -->
  <rect x="460" y="140" width="150" height="120" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="460" y="140" width="150" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="535" y="158" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">orders</text>
  <text x="474" y="182" font-size="11" fill="var(--muted)">PK id</text>
  <text x="474" y="198" font-size="11" fill="var(--text)">FK customer_id</text>
  <text x="474" y="214" font-size="11" fill="var(--text)">status, total_cents</text>
  <text x="474" y="230" font-size="11" fill="var(--text)">address_json</text>
  <text x="474" y="246" font-size="11" fill="var(--text)">placed_at, shipped_at</text>

  <!-- order_items -->
  <rect x="460" y="290" width="150" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="460" y="290" width="150" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="535" y="308" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">order_items</text>
  <text x="474" y="332" font-size="11" fill="var(--muted)">PK id</text>
  <text x="474" y="348" font-size="11" fill="var(--text)">FK order_id, variant_id</text>
  <text x="474" y="364" font-size="11" fill="var(--text)">quantity, unit_price</text>

  <!-- customers -->
  <rect x="460" y="20" width="150" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="460" y="20" width="150" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="535" y="38" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">customers</text>
  <text x="474" y="62" font-size="11" fill="var(--muted)">PK id</text>
  <text x="474" y="78" font-size="11" fill="var(--text)">email UNIQUE</text>
  <text x="474" y="94" font-size="11" fill="var(--text)">name, created_at</text>

  <!-- Arrows -->
  <line x1="150" y1="185" x2="208" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="290" y1="190" x2="290" y2="218" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="535" y1="140" x2="535" y2="112" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="460" y1="320" x2="372" y2="140" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="460" y1="320" x2="460" y2="262" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
</svg>
<figcaption>Core e-commerce schema: variants and inventory branch from products; order_items link orders to variants and snapshot the unit price.</figcaption>
</figure>

## Inventory Concurrency

The hardest problem in e-commerce databases is **overselling**: two users simultaneously buy the last unit. The solution is an atomic `UPDATE` with a check:

```sql
UPDATE inventory
SET quantity = quantity - 1
WHERE variant_id = ? AND quantity >= 1;
-- Check rows affected; if 0, item is out of stock
```

Because the database serialises writes to the same row, this is safe without application-level locks. A more advanced pattern adds a `reserved` column: increment `reserved` when an item is added to cart, decrement `quantity` and `reserved` when the order is placed.

## Pricing Logic

Sale prices live in `price_overrides`. To compute the effective price at query time:

```sql
SELECT
  p.name,
  COALESCE(
    (SELECT po.price FROM price_overrides po
     WHERE po.product_id = p.id
       AND po.starts_at <= strftime('%s','now')
       AND po.ends_at   >  strftime('%s','now')
     ORDER BY po.starts_at DESC LIMIT 1),
    p.base_price
  ) AS effective_price_cents
FROM products p
WHERE p.id = ?;
```

> **Note:** Pricing logic almost always gets more complex — tiered pricing, coupon codes, user-segment discounts. Keep the override table generic enough to accept these cases without a schema change.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · E-Commerce Queries</span></div>
  <div class="widget-body">
    <textarea data-setup="
CREATE TABLE categories (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT, slug TEXT UNIQUE);
CREATE TABLE products (id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, description TEXT, base_price INTEGER, active INTEGER DEFAULT 1);
CREATE TABLE product_variants (id INTEGER PRIMARY KEY, product_id INTEGER, sku TEXT UNIQUE, attributes TEXT, price_diff INTEGER DEFAULT 0);
CREATE TABLE inventory (variant_id INTEGER PRIMARY KEY, quantity INTEGER DEFAULT 0, reserved INTEGER DEFAULT 0);
CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, created_at INTEGER);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT DEFAULT 'pending', total_cents INTEGER, placed_at INTEGER, address_json TEXT);
CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, variant_id INTEGER, quantity INTEGER, unit_price INTEGER);
INSERT INTO categories VALUES (1,NULL,'Clothing','clothing'),(2,1,'T-Shirts','t-shirts');
INSERT INTO products VALUES (1,2,'Classic Tee','Cotton t-shirt',2999,1),(2,2,'Hoodie','Warm hoodie',5999,1);
INSERT INTO product_variants VALUES (1,1,'TEE-S-BLK','{}',0),(2,1,'TEE-M-BLK','{}',0),(3,1,'TEE-L-WHT','{}',200),(4,2,'HOOD-M-GRY','{}',0);
INSERT INTO inventory VALUES (1,10,2),(2,0,0),(3,5,1),(4,3,0);
INSERT INTO customers VALUES (1,'alice@x.com','Alice',1700000000),(2,'bob@x.com','Bob',1700001000);
INSERT INTO orders VALUES (1,1,'shipped',3199,1700100000,'{}');
INSERT INTO order_items VALUES (1,1,1,1,2999),(2,1,3,1,200);
">-- Products with available stock (quantity not reserved)
SELECT pv.sku,
       p.name,
       (p.base_price + pv.price_diff) AS price_cents,
       (i.quantity - i.reserved) AS available
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
JOIN inventory i ON i.variant_id = pv.id
WHERE (i.quantity - i.reserved) &gt; 0
ORDER BY available DESC;

-- Try: order summary
-- SELECT o.id, c.name, o.status, o.total_cents
-- FROM orders o JOIN customers c ON c.id = o.customer_id;</textarea>
  </div>
</div>

## Key Takeaways

- **Never store money as REAL** — use integer cents and format in the application layer.
- **Snapshot prices and addresses** on orders so historical records stay accurate through future catalog changes.
- **Atomic inventory updates** with `WHERE quantity >= 1` prevent overselling without application-level locks.
- **Variants** (via a separate table with JSON attributes) handle product diversity without exploding the `products` columns.
- Pricing overrides belong in a separate table with time bounds, not in the product row.
