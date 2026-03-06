

## Plan: Delivery Confirmation Calls Module

### Overview
Create a new dedicated page for "Confirmação de Entregas" (delivery confirmations) -- a simplified call log where agents quickly register whether a delivery was confirmed by the client. Only 3 fields: order number, client phone, and confirmation status.

### Database

**New table: `delivery_confirmations`**
- `id` uuid PK default gen_random_uuid()
- `order_number` text NOT NULL
- `client_phone` text NOT NULL
- `confirmed` boolean NOT NULL (true = confirmed, false = not confirmed)
- `notes` text nullable
- `created_by` uuid NOT NULL default auth.uid()
- `created_at` timestamptz NOT NULL default now()

RLS policies: agents can SELECT, INSERT, DELETE (using `is_authenticated_agent()`).

### Frontend Changes

1. **New page `src/pages/DeliveryConfirmations.tsx`**
   - Simple form at top: order number, client phone, confirmed (yes/no toggle or radio), optional notes
   - Table below listing all records with date, order number, phone, status (confirmed/not confirmed badge), agent name
   - Search/filter by order number or phone
   - Summary cards: total today, confirmed count, not confirmed count

2. **New route in `src/App.tsx`**
   - Add `/delivery-confirmations` route inside the authenticated layout

3. **Sidebar navigation in `src/components/AppSidebar.tsx`**
   - Add "Conf. Entregas" nav item with `Truck` icon from lucide-react, placed after "Ligações"

### Technical Details
- Table creation via migration tool
- RLS: `is_authenticated_agent()` for all operations
- Fetch agent profiles for displaying who registered each confirmation
- Use existing UI components (Card, Input, Badge, Switch/RadioGroup, Table)

