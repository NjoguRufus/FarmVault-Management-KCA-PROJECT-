# Inventory System — Full Audit

This document audits how inventory items are **added**, **stored**, **displayed**, **restocked**, and **reduced (deducted)** for every category.

---

## 1. Overview

- **Collection:** `inventoryItems` (Firestore)
- **Core fields (all items):** `name`, `category`, `quantity`, `unit`, `pricePerUnit`, `companyId`, `lastUpdated`, `createdAt`
- **Optional (all):** `supplierId`, `supplierName`, `pickupDate`, `cropTypes`, `minThreshold`
- **Low-stock rule:** `item.quantity < (item.minThreshold ?? 10)` — threshold is not saved on add; default 10 is used if missing.

---

## 2. Add Item — Per Category

### 2.1 Chemical

| Aspect | Box | Single products |
|--------|-----|------------------|
| **Form: same row as Category** | Packaging dropdown (Box / Single) | — |
| **Form: quantity** | Number of boxes | Number of units |
| **Form: extra** | Units per box (bottles/packets), then "Total: X units" | — |
| **Form: Unit row** | Unit dropdown (kg, litres, bags, etc.) + optional per-item field (label/placeholder depend on unit) | Same |
| **Validation** | `unitsPerBox` required when Box | Quantity required |
| **Stored `quantity`** | Number of **boxes** | Number of **units** |
| **Stored `unit`** | `'boxes'` | `'units'` |
| **Stored extra** | `packagingType: 'box'`, `unitsPerBox`, optional `kgs` (per-item weight) | `packagingType: 'single'`, optional `kgs` |
| **Display** | `"X boxes (Y/box) = Z units"` (Z = X × Y) | `"X units"` |
| **Effective qty (add form)** | `quantity` (boxes) — used for Price × Qty = Total | `quantity` (units) |

**Price/total on add:** Uses `effectiveQuantityForAdd` = `quantity` (boxes for box, units for single). Total = pricePerUnit × that quantity.

---

### 2.2 Fuel / Diesel

| Aspect | Detail |
|--------|--------|
| **Form: same row as Category** | Containers (number) |
| **Form: below** | Fuel type (Diesel / Petrol), Litres (optional) |
| **Validation** | Containers required |
| **Stored `quantity`** | Number of **containers** |
| **Stored `unit`** | `'containers'` |
| **Stored extra** | `fuelType` ('diesel' | 'petrol'), `containers` (same as quantity), `litres` if provided |
| **Display** | `"X containers [diesel|petrol][, Y L]"` |
| **Effective qty (add form)** | `containers` |

**Note:** Category is normalized to `'fuel'` for both fuel and diesel. No Unit dropdown row for fuel (unit is always containers).

---

### 2.3 Fertilizer

| Aspect | Detail |
|--------|--------|
| **Form: same row as Category** | Quantity (number of bags or kg) |
| **Form: Unit row** | Unit: Bags | Kg. Optional: "Kgs (optional, per item e.g. per bag)" |
| **Validation** | Quantity required |
| **Stored `quantity`** | Number of bags or kg (same as form quantity) |
| **Stored `unit`** | `'bags'` or `'kg'` |
| **Stored extra** | If bags: `bags` = quantity, optional `kgs`. If kg: `kgs` = quantity |
| **Display** | `"X bags[, Y kg]"` or quantity + unit |
| **Effective qty (add form)** | `quantity` |

---

### 2.4 Seeds

| Aspect | Detail |
|--------|--------|
| **Form: same row as Category** | Quantity |
| **Form: below** | Crop (for this seed) — single crop type |
| **Form: Unit row** | Unit: Packets, Kg, Bags, Tins |
| **Validation** | Quantity required |
| **Stored `quantity`** | Number (packets/kg/bags/tins) |
| **Stored `unit`** | Selected unit (default `'packets'`) |
| **Stored extra** | `cropTypes: [seedCrop]` if crop selected |
| **Display** | `"X packets"` (or selected unit) |
| **Effective qty (add form)** | `quantity` |

---

### 2.5 Wooden crates

| Aspect | Detail |
|--------|--------|
| **Form: same row as Category** | Quantity (labelled "Boxes") |
| **Form: below** | Box size (Big / Small) |
| **Validation** | Quantity required |
| **Stored `quantity`** | Number of boxes |
| **Stored `unit`** | From main Unit dropdown (kg, litres, bags, etc. — typically not overridden for crates in payload) |
| **Stored extra** | `boxSize: 'big' | 'small'` |
| **Display** | `"X Big box"` or `"X Small box"` |
| **Effective qty (add form)** | `quantity` |

**Note:** For "other" categories (including wooden-crates when treated generically), `data.unit = unit` from the Unit dropdown.

---

### 2.6 Other categories (materials, sacks, ropes, custom)

| Aspect | Detail |
|--------|--------|
| **Form: same row as Category** | Quantity |
| **Form: Unit row** | Unit: Kg, Litres, Bags, Packets, Tins, Boxes, Units |
| **Validation** | Quantity required (generic) |
| **Stored `quantity`** | Number entered |
| **Stored `unit`** | Selected unit |
| **Stored extra** | None category-specific |
| **Display** | `"X {unit}"` |
| **Effective qty (add form)** | `quantity` |

---

## 3. Common add-form behaviour (all categories)

- **Crop scope (optional):** At bottom of form. Multi-select crops; stored as `cropTypes` (except seeds, which use `seedCrop` → `cropTypes: [seedCrop]`).
- **Supplier / Pickup date:** Optional; stored as `supplierId`, `supplierName`, `pickupDate`.
- **Price per unit & total:** Stored `pricePerUnit`; total is not stored (derived as quantity × pricePerUnit when needed). Real-time sync: total = pricePerUnit × effectiveQuantityForAdd; editing total updates pricePerUnit.
- **Count as expense:** If checked and project selected, one expense is created with amount = quantity × pricePerUnit (using add-form quantity/containers and description by category).
- **Min threshold:** Shown in form as read-only "10"; **not** written to document. Low-stock uses `item.minThreshold ?? 10`.

---

## 4. How data is reduced (deduct)

- **Trigger:** User selects item and enters quantity to deduct.
- **Validation:** `parseQuantityOrFraction(deductQuantity)` must be &gt; 0 and ≤ `deductItem.quantity`.
- **Update:** `quantity: increment(-qty)` on the inventory document. **No** change to `unit`, `unitsPerBox`, `packagingType`, etc.
- **Unit:** Deduction is always in the **stored** unit:
  - **Chemical (box):** deduct in **boxes** (e.g. deduct 2 = 2 boxes).
  - **Chemical (single):** deduct in **units**.
  - **Fuel:** deduct in **containers**.
  - **Fertilizer:** deduct in **bags** or **kg** (whatever is stored).
  - **Seeds / wooden-crates / other:** deduct in stored `unit`.
- **Audit:** `DEDUCT` log with `quantityDeducted`, `unit`, optional `reason`.

---

## 5. How data is increased (restock)

- **Trigger:** User selects item, enters quantity to add and total cost.
- **Update:** `quantity: increment(qty)` on the inventory document. **No** change to `unitsPerBox`, `packagingType`, etc.
- **Unit:** Restock is always in the **stored** unit (same as deduct).
- **Side effects:**  
  - A document is added to `inventoryPurchases` (quantityAdded, unit, totalCost, pricePerUnit = totalCost/qty).  
  - If project selected, an expense is created (description e.g. "Restock {name} (X {unit})", amount = total cost).
- **Audit:** `RESTOCK` log with quantityAdded, totalCost, unit.

---

## 6. Delete

- **Action:** Document removed from `inventoryItems`.
- **Audit:** `DELETE` log (no quantity/unit).

---

## 7. Display (formatInventoryQuantity)

| Category | Condition | Display string |
|----------|-----------|----------------|
| Chemical | box + unitsPerBox | `"X boxes (Y/box) = Z units"` (Z = X×Y) |
| Chemical | single | `"X units"` |
| Fuel / Diesel | has containers/fuelType | `"X containers [diesel|petrol][, Y L]"` |
| Fertilizer | bags or unit bags | `"X bags[, Y kg]"` |
| Wooden crates | has boxSize | `"X Big box"` / `"X Small box"` |
| Default | — | `"X {unit}"` |

---

## 8. Effective quantity summary (add form only)

Used only for **Price per unit × Quantity = Total** in the add dialog:

| Category | effectiveQuantityForAdd |
|----------|-------------------------|
| Fertilizer | `quantity` (bags or kg) |
| Fuel / Diesel | `containers` |
| Chemical | `quantity` (boxes or units) |
| Wooden-crates | `quantity` |
| Seeds | `quantity` |
| Other | `quantity` |

---

## 9. Stored document shape by category (minimal)

```ts
// Chemical (box)
{ name, category: 'chemical', quantity: number_of_boxes, unit: 'boxes',
  packagingType: 'box', unitsPerBox, kgs?, pricePerUnit, ... }

// Chemical (single)
{ name, category: 'chemical', quantity: number_of_units, unit: 'units',
  packagingType: 'single', kgs?, pricePerUnit, ... }

// Fuel
{ name, category: 'fuel', quantity: containers, unit: 'containers',
  fuelType, containers, litres?, pricePerUnit, ... }

// Fertilizer
{ name, category: 'fertilizer', quantity, unit: 'bags'|'kg',
  bags? (if bags), kgs?, pricePerUnit, ... }

// Seeds
{ name, category: 'seeds', quantity, unit: 'packets'|..., cropTypes?, pricePerUnit, ... }

// Wooden crates
{ name, category: 'wooden-crates', quantity, unit, boxSize: 'big'|'small', pricePerUnit, ... }

// Other
{ name, category, quantity, unit, pricePerUnit, ... }
```

---

## 10. Edge cases and notes

1. **Chemical box:** Total consumable units = `quantity * unitsPerBox`. Deduct/restock only change `quantity` (boxes); `unitsPerBox` is fixed. So deducting 1 box reduces stock by 1 box (and effectively `unitsPerBox` fewer consumable units).
2. **Fertilizer in kg:** Stored as `quantity` and `unit: 'kg'`, with `kgs = quantity`. Display is generic `"X kg"` unless bags logic is used.
3. **minThreshold:** Not set on add; UI uses default 10 when undefined.
4. **Diesel:** Stored and displayed as category `'fuel'` with `fuelType: 'diesel'` where applicable.
5. **Crop scope:** Stored as `cropTypes` array (except seeds: single crop from seed form). Used for filtering/scope only; not used in quantity or unit logic.

This audit reflects the behaviour implemented in `InventoryPage.tsx` and the `InventoryItem` type as of the last review.
