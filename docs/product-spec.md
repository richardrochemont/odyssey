# Odyssey Product Specification

Odyssey is an intelligent portfolio operating system for self-managing residential landlords. It serves as a refined private portfolio command center that is minimal, modern, calm, premium, and decision-oriented.

## Product Position

Odyssey shifts focus away from traditional property-management file cabinets to answer core wealth-management and operational questions:
1. How is my portfolio performing?
2. What cash came in, went out, and is projected next?
3. Which tenant or lease decisions need attention?
4. What changed, why does it matter, and what should I do next?

**Out of Scope**: Rent payment processing rails, tenant screening, legal contracts, and electronic signatures.

## Key Workspaces

1. **Portfolio Overview (Command Dashboard)**:
   - Polished landing cockpit.
   - exactly 5 premium metrics: Portfolio Value, Monthly Rental Income, Net Cash Flow, Occupancy, and Attention Needed.
   - Central 9-month cash flow chart detailing actual collected rent, projected rent, and expenses.
   - Portfolio Briefing panel showing data-backed operational insights.
   - Decisions Needed list focusing on expiring leases, delinquency, and vacancies.

2. **Properties**:
   - Building and unit registry.
   - Occupancy states tracking (occupied, vacant, notice_given, offline).

3. **Tenants & Leases**:
   - Structured around renewal planning and tenant timelines.
   - Lease detail views showing outstanding balance, document vault, and payment logs.
   - Renewal Planner displaying rent recommendations indexes and local AI draft renewal letters.

4. **Cash Flow & Payments Ledger**:
   - Ledgers displaying tenant payments with due dates, statuses (upcoming, paid, partial, overdue, waived), and payment methods.
   - Manual ledger entry creation, edit, and archival logging.
   - Warning label: "Operational view — not accounting."

5. **Expenses Workspace**:
   - Focused ledger for operating costs under a 10-category taxonomy.
   - Modal quick-add form in root header.
   - Property and category summaries.

6. **AI Operator**:
   - Floating assistant drawer on all authenticated screens.
   - Natural language expense capture (extracts amount, vendor, category, property from a chat sentence).
   - Projections helper mapping structured intents.
