# Per-Package Payment Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bulk user-level payment system with per-package payment activation, unified user list with orange dot flags, and filter bar.

**Architecture:** New `PATCH /admin/packages/:id/payment` endpoint activates a single package. Admin panel merges Confirmed/Pending/Archived tabs into one unified user list with derived status flags. User-level `payment_status` is no longer read for UI decisions — everything derives from package state.

**Tech Stack:** Hono (backend), React + Tailwind (frontend), Supabase Postgres

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/functions/make-server-b87b0c07/index.ts` | Modify | New per-package endpoint, update GET /admin/users response, add packageId to bookings response |
| `src/app/components/AdminPanel.tsx` | Modify | Unified user list, flags, filter bar, per-package Mark Paid button, updated types |

---

### Task 1: Backend — New `PATCH /admin/packages/:id/payment` Endpoint

**Files:**
- Modify: `supabase/functions/make-server-b87b0c07/index.ts` (insert after existing PATCH /admin/users/:email/payment ~line 3355)

- [ ] **Step 1: Add the new endpoint**

Insert after the existing `PATCH /admin/users/:email/payment` endpoint (around line 3355). The new endpoint activates a single package by ID.

**IMPORTANT patterns from codebase:**
- KV store is imported as `import * as kv from "./kv_store.ts"` — use `kv.set(key, object)` directly, NOT `getKV()`
- Token storage pattern: pass a plain object with `id`, `token`, `email`, `expiresAt`, `used`, `createdAt` fields
- Expiry calculation: use `getSkopjeTime()` for business logic dates, and hardcoded `35` for package validity (matching existing code at lines 2422 and 3242)

```typescript
// PATCH /admin/packages/:id/payment - Activate a SINGLE package
app.patch("/make-server-b87b0c07/admin/packages/:id/payment", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const packageId = c.req.param('id');
    const { paymentStatus } = await c.req.json();

    if (!paymentStatus || !['paid', 'unpaid'].includes(paymentStatus)) {
      return c.json({ error: 'Invalid paymentStatus' }, 400);
    }

    const supabase = getSupabase();

    // Fetch the package
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const userEmail = pkg.user_email;

    // Fetch the user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (paymentStatus === 'paid') {
      // === ACTIVATE THIS PACKAGE ONLY ===
      const now = getSkopjeTime();

      if (pkg.activation_status === 'pending') {
        // Pending package: full activation
        const expiryDate = new Date(now);
        expiryDate.setDate(expiryDate.getDate() + 35);

        await supabase
          .from('user_packages')
          .update({
            payment_status: 'paid',
            activation_status: 'activated',
            package_status: 'active',
            activation_date: now.toISOString(),
            expiry_date: expiryDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId);
      } else {
        // Already active: just update payment status
        await supabase
          .from('user_packages')
          .update({
            payment_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId);
      }

      // Confirm any pending reservations linked to THIS package only
      const { data: pendingRes } = await supabase
        .from('reservations')
        .select('id')
        .eq('package_id', packageId)
        .eq('reservation_status', 'pending');

      if (pendingRes && pendingRes.length > 0) {
        const pendingIds = pendingRes.map((r: any) => r.id);
        await supabase
          .from('reservations')
          .update({
            reservation_status: 'confirmed',
            payment_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .in('id', pendingIds);
      }

      // Ensure user is activated (for first-time onboarding)
      if (user.activation_status !== 'activated') {
        await supabase
          .from('users')
          .update({
            activation_status: 'activated',
            updated_at: new Date().toISOString(),
          })
          .eq('email', userEmail);
      }

      // Email logic: check password_hash to determine email type
      let emailType = 'none';
      const userLang = pkg.language || user.language || 'en';
      const appUrl = 'https://app.wellnestpilates.com';

      try {
        if (user.password_hash) {
          // Existing user — send payment confirmation
          await sendPaymentConfirmationEmail(userEmail, user.name || pkg.name || '', userLang);
          emailType = 'payment_confirmation';
        } else {
          // New user — send password setup email
          const verificationToken = generateSecureToken('verify');
          const tokenKey = `verification_token:${verificationToken}`;
          const tokenExpiry = new Date();
          tokenExpiry.setHours(tokenExpiry.getHours() + 24);

          await kv.set(tokenKey, {
            id: tokenKey,
            token: verificationToken,
            email: userEmail,
            expiresAt: tokenExpiry.toISOString(),
            used: false,
            createdAt: now.toISOString(),
          });

          await sendActivationEmail(userEmail, user.name || pkg.name || '', verificationToken, appUrl, userLang);
          emailType = 'password_setup';
        }
      } catch (emailError) {
        console.error(`Email sending failed for ${userEmail}:`, emailError);
        // Payment still succeeded, just email failed
      }

      console.log(`✅ Package ${packageId} marked paid for ${userEmail} (email: ${emailType})`);
      return c.json({ success: true, emailType });

    } else {
      // === MARK THIS PACKAGE UNPAID ===
      await supabase
        .from('user_packages')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', packageId);

      // Also mark linked reservations as unpaid
      await supabase
        .from('reservations')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('package_id', packageId);

      console.log(`❌ Package ${packageId} marked unpaid for ${userEmail}`);
      return c.json({ success: true });
    }

  } catch (error) {
    console.error('Error updating package payment:', error);
    return c.json({ error: 'Failed to update payment', details: (error as Error).message }, 500);
  }
});
```

- [ ] **Step 2: Run api:check to update route manifest**

Run: `npm run api:check`
Expected: PASS (new route gets picked up)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/make-server-b87b0c07/index.ts docs/generated/
git commit -m "feat: add per-package payment endpoint PATCH /admin/packages/:id/payment"
```

---

### Task 2: Backend — Update GET /admin/users to Return Derived Status Flags

**Files:**
- Modify: `supabase/functions/make-server-b87b0c07/index.ts` (inside GET /admin/users handler, ~line 2848 `.map()` loop)

- [ ] **Step 1: Add flag derivation inside the existing user mapping loop**

Inside the GET `/admin/users` endpoint, find the `.map((user: any) => { ... })` loop at ~line 2848. The flag derivation code must go INSIDE this loop, AFTER the `packages` variable is computed (~line 2859) and BEFORE the `return` statement (~line 2885).

Replace the `effectivePaymentStatus` derivation block (lines 2879-2883) with flag derivation. Use `getSkopjeTime()` for the `now` variable (add it before the `.map()` loop if not already present):

```typescript
// Derive user flag from package state (inside the .map loop)
const now = getSkopjeTime(); // Add BEFORE the .map() loop if not present
// ... inside the loop, after packages are computed:
const hasUnpaidPackage = packages.some((p: any) =>
  p.payment_status === 'unpaid' && p.package_status === 'pending'
);
const isNewUser = !user.password_hash;
const hasActivePackage = packages.some((p: any) =>
  p.package_status === 'active'
);
const hasExpiringPackage = packages.some((p: any) => {
  if (p.package_status !== 'active' || !p.expiry_date) return false;
  const daysLeft = (new Date(p.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysLeft <= 5 && daysLeft > 0;
});
const terminalStatuses = ['fully_used', 'expired', 'cancelled'];
const allTerminal = packages.length > 0 && packages.every((p: any) => terminalStatuses.includes(p.package_status));

// Priority: unpaid > new > expiring > active > inactive
let flag: string;
let flagMessage: string;
if (hasUnpaidPackage) {
  const unpaidCount = packages.filter((p: any) => p.payment_status === 'unpaid' && p.package_status === 'pending').length;
  flag = 'needs_payment';
  flagMessage = `${unpaidCount} package${unpaidCount > 1 ? 's' : ''} awaiting payment`;
} else if (isNewUser && hasActivePackage) {
  flag = 'new_user';
  flagMessage = 'New user, password not yet set';
} else if (hasExpiringPackage) {
  const expiringPkg = packages.find((p: any) => {
    if (p.package_status !== 'active' || !p.expiry_date) return false;
    const daysLeft = (new Date(p.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 5 && daysLeft > 0;
  });
  const daysLeft = Math.ceil((new Date(expiringPkg.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  flag = 'expiring';
  flagMessage = `Package expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
} else if (hasActivePackage) {
  flag = 'active';
  flagMessage = 'All packages active';
} else if (allTerminal) {
  flag = 'inactive';
  flagMessage = 'No active packages';
} else {
  flag = 'inactive';
  flagMessage = 'No packages';
}
```

- [ ] **Step 2: Add flag and flagMessage to the returned user object**

In the return statement (~line 2885-2911), add these two fields. Keep `paymentStatus` for backward compatibility:

```typescript
return {
  // ... existing fields ...
  flag,
  flagMessage,
  paymentStatus: effectivePaymentStatus, // keep for backward compat
};
```

- [ ] **Step 3: Also add `packageId` to the GET /admin/bookings response**

Find the bookings endpoint mapping (GET `/admin/calendar` around line 3785 or the bookings response mapping). Add `packageId: res.package_id` to each booking object returned, so the calendar view can use it for per-package payment.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-b87b0c07/index.ts
git commit -m "feat: add derived flag/flagMessage to GET /admin/users, packageId to bookings"
```

---

### Task 3: Frontend — Update Types and User Mapping

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Add `flag` and `flagMessage` to `User` type (line 29)**

```typescript
export type User = {
  // ... existing fields ...
  flag?: string;       // 'needs_payment' | 'new_user' | 'expiring' | 'active' | 'inactive'
  flagMessage?: string; // Human-readable one-liner
};
```

- [ ] **Step 2: Add `packageId` to `Booking` type (line 67)**

```typescript
export type Booking = {
  // ... existing fields ...
  packageId?: string;
};
```

- [ ] **Step 3: Update user mapping in fetchBookings (line 476)**

In the `formattedUsers` mapping (~line 476), add `flag` and `flagMessage` extraction:

```typescript
const formattedUsers: User[] = usersData.users.map((user: any) => {
  const status = user.paymentStatus === 'paid' ? 'confirmed' : 'pending';
  return {
    // ... existing fields ...
    status, // Keep for backward compat with alerts
    flag: user.flag,
    flagMessage: user.flagMessage,
    // ... rest of existing fields ...
  };
});
```

- [ ] **Step 4: Update booking mapping to include packageId**

Find where bookings are mapped from API response and add `packageId: b.packageId` to the mapping.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 6: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: add flag/flagMessage to User type, packageId to Booking type"
```

---

### Task 4: Frontend — Replace User Subtabs with Unified List + Filter Bar

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Replace userSubTab state with filter state (line 126)**

```typescript
// Replace:
const [userSubTab, setUserSubTab] = useState<'confirmed' | 'pending' | 'archived'>('confirmed');
// With:
const [userFilter, setUserFilter] = useState<'all' | 'needs_attention' | 'active' | 'inactive'>('all');
```

- [ ] **Step 2: Replace the subtab UI (around lines 2197-2238)**

Find the three-tab bar (Paid / Not Paid / Archived). Replace with a filter bar. Use `users` (not `allUsers`) as the state variable:

```tsx
{/* User Filter Bar */}
<div className="flex gap-1.5 mb-4 bg-stone-100 rounded-lg p-1 overflow-x-auto">
  {([
    { key: 'all' as const, label: 'All' },
    { key: 'needs_attention' as const, label: '● Needs Attention' },
    { key: 'active' as const, label: 'Active' },
    { key: 'inactive' as const, label: 'Inactive' },
  ]).map(tab => {
    const count = users.filter(u => {
      if (tab.key === 'all') return true;
      if (tab.key === 'needs_attention') return u.flag === 'needs_payment' || u.flag === 'new_user' || u.flag === 'expiring';
      if (tab.key === 'active') return u.flag === 'active';
      if (tab.key === 'inactive') return u.flag === 'inactive';
      return true;
    }).length;
    return (
      <button
        key={tab.key}
        onClick={() => setUserFilter(tab.key)}
        className={`flex-1 min-w-fit py-2 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
          userFilter === tab.key
            ? 'bg-white text-stone-900 shadow-sm'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        {tab.label} ({count})
      </button>
    );
  })}
</div>
```

- [ ] **Step 3: Replace user filtering logic (around lines 2284-2291)**

Replace the current filtering that uses `userSubTab` and `getSubTab`:

```typescript
const filteredUsers = users.filter(u => {
  if (userFilter === 'all') return true;
  if (userFilter === 'needs_attention') return u.flag === 'needs_payment' || u.flag === 'new_user' || u.flag === 'expiring';
  if (userFilter === 'active') return u.flag === 'active';
  if (userFilter === 'inactive') return u.flag === 'inactive';
  return true;
});
```

- [ ] **Step 4: Update alerts useMemo (lines 298-355)**

The `alerts` useMemo uses `getSubTab` and `userSubTab` in the `base` object. Update the `base` object to use `flag` instead:

```typescript
// Replace in base object:
const base = { userEmail: u.email, userName: `${u.name} ${u.surname}`, firstName: u.name, lastName: u.surname, userSubTab: (u.flag === 'inactive' ? 'inactive' : 'all') as any, userId: u.id };
```

Also update the filter at line 318 from `if (u.blocked || u.status !== 'confirmed') continue;` to:
```typescript
if (u.blocked || u.flag === 'inactive') continue;
```

And at line 349, update the consistency check `base` similarly.

Update the `Alert` type (line 222) — change `userSubTab` field type to accept the new filter values or make it optional.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 6: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: replace user subtabs with unified filter bar and flag-based filtering"
```

---

### Task 5: Frontend — Add Orange Dot + Status Message to User Cards

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Add orange dot to compact user card (around lines 2339-2410)**

Inside the user card's flex container, before the user name, add:

```tsx
{/* Orange dot for users needing attention */}
{(user.flag === 'needs_payment' || user.flag === 'new_user' || user.flag === 'expiring') && (
  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
)}
```

- [ ] **Step 2: Add status message in expanded view (around line 2413)**

After the user name/email section in the expanded card:

```tsx
{/* Status message */}
{user.flagMessage && (
  <p className="text-xs text-stone-500 mt-1 mb-3">
    {user.flagMessage}
  </p>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 4: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: add orange dot and status message to user cards"
```

---

### Task 6: Frontend — Wire Per-Package "Mark Paid" to New Endpoint

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Add new `updatePackagePayment` function**

Add alongside the existing `updatePaymentStatus` function (~line 1079):

```typescript
const updatePackagePayment = async (packageId: string, paymentStatus: 'paid' | 'unpaid') => {
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/packages/${packageId}/payment`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({ paymentStatus }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update');

    if (paymentStatus === 'paid') {
      if (data.emailType === 'password_setup') {
        toast.success('Paid & login email sent!');
      } else if (data.emailType === 'payment_confirmation') {
        toast.success('Paid & confirmation email sent!');
      } else {
        toast.success('Package marked as paid');
      }
    } else {
      toast.success('Package marked as unpaid');
    }
    await fetchBookings();
  } catch (error: any) {
    console.error('Error updating package payment:', error);
    toast.error(error.message || 'Failed to update payment');
  }
};
```

- [ ] **Step 2: Update payment button in expanded package view (~lines 2506-2524)**

Replace `updatePaymentStatus(user.email, ...)` with `updatePackagePayment(pkg.id, ...)`:

```tsx
<button
  onClick={() => {
    setPaymentUpdatingEmail(user.email);
    updatePackagePayment(pkg.id, pkg.paymentStatus === 'paid' ? 'unpaid' : 'paid')
      .finally(() => setPaymentUpdatingEmail(null));
  }}
  disabled={paymentUpdatingEmail === user.email}
  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
    pkg.paymentStatus === 'paid'
      ? 'bg-green-100 text-green-700 hover:bg-amber-100 hover:text-amber-700'
      : 'bg-amber-100 text-amber-700 hover:bg-green-100 hover:text-green-700'
  }`}
>
  {paymentUpdatingEmail === user.email ? '...' : pkg.paymentStatus === 'paid' ? 'Paid' : 'Mark Paid'}
</button>
```

- [ ] **Step 3: Update calendar view payment buttons (~lines 1848-1899)**

Replace `updatePaymentStatus(user.email, ...)` with per-package calls. Use `booking.packageId` if available, otherwise keep the old behavior for single-session bookings without a package:

```tsx
{booking.packageId ? (
  <button onClick={() => {
    setPaymentUpdatingEmail(booking.email);
    updatePackagePayment(booking.packageId!, isPaid ? 'unpaid' : 'paid')
      .finally(() => setPaymentUpdatingEmail(null));
  }}>
    {/* existing button content */}
  </button>
) : (
  <button onClick={() => {
    setPaymentUpdatingEmail(booking.email);
    updatePaymentStatus(booking.email, isPaid ? 'unpaid' : 'paid')
      .finally(() => setPaymentUpdatingEmail(null));
  }}>
    {/* existing button content — fallback for non-package bookings */}
  </button>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: wire per-package Mark Paid to new endpoint, calendar fallback for non-package bookings"
```

---

### Task 7: Cleanup — Remove Dead Code

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Remove unused functions**

Remove `handleActivateUser` (~line 1127-1180) and `handleStatusChange` (~line 1062-1077) — both defined but never called from JSX.

- [ ] **Step 2: Remove `getSubTab` function**

Already replaced by flag-based filtering in Task 4. Remove the function definition (~line 302-305). Make sure no remaining references exist.

- [ ] **Step 3: Clean up old `userSubTab` references**

Search for any remaining references to `userSubTab` and remove. The `Alert` type's `userSubTab` field should be updated or made optional if still used for alert navigation.

- [ ] **Step 4: Keep `updatePaymentStatus` function**

Do NOT remove `updatePaymentStatus` — it's still needed as fallback for calendar bookings without a `packageId` (single-session non-package bookings).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 6: Run api:check**

Run: `npm run api:check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "chore: remove dead payment code (handleActivateUser, handleStatusChange, getSubTab)"
```

---

### Task 8: Deploy & Verify

- [ ] **Step 1: Final build check**

Run: `npm run build`
Expected: Build passes

- [ ] **Step 2: Final api:check**

Run: `npm run api:check`
Expected: PASS

- [ ] **Step 3: Deploy backend**

```bash
SUPABASE_ACCESS_TOKEN="..." npx supabase functions deploy make-server-b87b0c07 --project-ref azqkguctispoctvmpmci
```

- [ ] **Step 4: Push frontend**

```bash
git push origin main
```

- [ ] **Step 5: Run smoke tests**

Run: `npm run smoke`
Expected: All endpoints respond correctly

- [ ] **Step 6: Manual verification**

Test with `asani.kastri@gmail.com`:
1. Open admin panel → Users section → verify unified list with filter bar
2. Verify orange dot shows for users with unpaid packages
3. Expand a user → verify flag message sentence and per-package payment buttons
4. Click "Mark Paid" on ONE package → verify only that package activates (not all)
5. Check calendar view → verify payment button works per-package
6. Verify a single-session booking (no package) still works with the old payment flow
