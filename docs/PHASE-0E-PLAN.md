# Phase 0E: Fix Activation Flow & Migrate Auth Endpoints

## Summary

The current activation flow is WRONG. It requires users to enter activation codes.
The CORRECT flow: Admin clicks "Activate User" after cash payment → system activates.

## Files to Change

| File | Changes |
|------|---------|
| `supabase/functions/make-server-b87b0c07/index.ts` | 1. Remove activation_code from POST /packages<br>2. Rewrite POST /activate<br>3. Migrate POST /auth/register<br>4. Migrate POST /auth/login |
| `src/app/components/AdminPanel.tsx` | 1. Rename "Send Code" → "Activate User"<br>2. Fix confirmSendCode undefined bug<br>3. Add activate button to calendar view |

---

## Task 1: Remove activation_code from POST /packages

**Lines affected:** 1279-1296, 1318-1331, 1382, 1389

**Current behavior:**
```typescript
// Line 1279-1296: Creates activation code in KV
const activationCode = generateActivationCode();
const codeKey = `activation_code:${activationCode}`;
await kv.set(codeKey, activationCodeData);

// Line 1318-1331: Sends activation code email
await sendActivationEmail(email, name, surname, activationCode, ...);

// Line 1389: Returns activationCode in response
return c.json({ ..., activationCode, ... });
```

**New behavior:**
- Remove activation code generation entirely
- Keep the confirmation email (booking confirmation, NOT activation code)
- User stays in `pending` status until Admin activates

**Changes:**
1. Delete lines 1279-1296 (activation code creation)
2. Delete lines 1318-1331 (sendActivationEmail call)
3. Remove `activationCode` from response (line 1389)
4. Keep `requiresActivation: true` in response

---

## Task 2: Rewrite POST /activate endpoint

**Current location:** Lines 1691-1783

**Current behavior (WRONG):**
```typescript
// Requires activation code input
const { email, activationCode } = body;
if (!email || !activationCode) { return error; }

// Validates activation code from KV
const codeKey = `activation_code:${activationCode}`;
const activationData = await kv.get(codeKey);
```

**New behavior (CORRECT):**
```typescript
// Admin-triggered, no code required
Input:  { email: string }
Output: { success: true, user: {...} }

Actions:
1. Update users table:
   - activation_status = 'activated'
   - payment_status = 'paid'

2. Update user_packages table:
   - activation_status = 'activated'
   - payment_status = 'paid'
   - activation_date = NOW()
   - expiry_date = NOW() + 35 days

3. Send login email with Magic Link (or temp password)

4. Return success response
```

**New endpoint code:**
```typescript
app.post("/make-server-b87b0c07/activate", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // 1. Update user
    const { data: user, error: userError } = await supabase
      .from('users')
      .update({
        activation_status: 'activated',
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('email', normalizedEmail)
      .select()
      .single();

    if (userError) {
      return c.json({ error: 'User not found', details: userError.message }, 404);
    }

    // 2. Update user packages (activate all pending packages)
    const activationDate = new Date().toISOString();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 35);

    await supabase
      .from('user_packages')
      .update({
        activation_status: 'activated',
        payment_status: 'paid',
        activation_date: activationDate,
        expiry_date: expiryDate.toISOString(),
        status: 'active',
        updated_at: activationDate
      })
      .eq('user_email', normalizedEmail)
      .eq('activation_status', 'pending');

    // 3. Update related reservations to confirmed
    await supabase
      .from('reservations')
      .update({
        reservation_status: 'confirmed',
        payment_status: 'paid',
        updated_at: activationDate
      })
      .eq('user_email', normalizedEmail)
      .eq('reservation_status', 'pending');

    // 4. Send login email (Magic Link or temp password)
    // Generate verification token for password setup
    const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const tokenKey = `verification_token:${verificationToken}`;
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);

    await kv.set(tokenKey, {
      id: tokenKey,
      token: verificationToken,
      email: normalizedEmail,
      expiresAt: tokenExpiry.toISOString(),
      used: false,
      createdAt: new Date().toISOString()
    });

    // Send activation/login email
    const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';
    await sendLoginEmail(normalizedEmail, user.name, verificationToken, appUrl);

    console.log(`User activated by admin: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: 'User activated successfully',
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname,
        activation_status: 'activated',
        payment_status: 'paid'
      }
    });

  } catch (error) {
    console.error('Error activating user:', error);
    return c.json({ error: 'Activation failed', details: error.message }, 500);
  }
});
```

---

## Task 3: Migrate POST /auth/register to Supabase

**Current location:** Lines 2610-2666

**Current behavior:**
- Checks KV for existing user
- Creates user in KV with passwordHash

**New behavior:**
- Check Supabase `users` table for existing user
- Update existing user with passwordHash, OR
- Create new user in Supabase `users` table

**Changes:**
```typescript
// Before: KV
const userKey = `user:${normalizedEmail}`;
const existingUser = await kv.get(userKey);
await kv.set(userKey, user);

// After: Supabase
const { data: existingUser } = await supabase
  .from('users')
  .select('*')
  .eq('email', normalizedEmail)
  .maybeSingle();

if (existingUser?.password_hash) {
  return c.json({ error: 'Account exists' }, 400);
}

// Update or insert
await supabase.from('users').upsert({
  email: normalizedEmail,
  name, surname, mobile,
  password_hash: passwordHash,
  verified: true,
  updated_at: new Date().toISOString()
});
```

---

## Task 4: Migrate POST /auth/login to Supabase

**Current location:** Lines 2668-2727

**Current behavior:**
- Fetches user from KV
- Creates session in KV (keep this)

**New behavior:**
- Fetch user from Supabase `users` table
- Keep session in KV (ephemeral data, OK to keep)

**Changes:**
```typescript
// Before: KV
const userKey = `user:${normalizedEmail}`;
const user = await kv.get(userKey);

// After: Supabase
const { data: user, error } = await supabase
  .from('users')
  .select('*')
  .eq('email', normalizedEmail)
  .single();

// Session stays in KV (ephemeral, ok)
await kv.set(sessionKey, sessionData);
```

---

## Task 5: Update AdminPanel.tsx

### 5a. Rename "Send Code" → "Activate User" (Users Tab)

**Location:** Line 1018-1031

**Current:**
```tsx
{user.status === 'pending' && user.packageType !== 'single' ? (
  <button onClick={() => handleSendCode(user)}>
    <Mail /> Send Code
  </button>
```

**New:**
```tsx
{user.status === 'pending' && (
  <button onClick={() => handleActivateUser(user)}>
    <CheckCircle /> Activate User
  </button>
```

### 5b. Fix confirmSendCode undefined (Bug #8)

**Location:** Line 1388

The modal references `confirmSendCode` but function doesn't exist.

**Fix:** Replace the modal with an "Activate User" confirmation modal.

### 5c. New handleActivateUser function

**Location:** After line 519 (after handleSendCode)

```tsx
const handleActivateUser = async (user: User) => {
  if (!confirm(`Activate ${user.name} ${user.surname}? This will:\n• Set status to Activated\n• Set payment to Paid\n• Send login email`)) {
    return;
  }

  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/activate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email: user.email }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to activate user');
      return;
    }

    alert(`${user.name} ${user.surname} activated successfully!`);
    fetchUsers(); // Refresh user list
  } catch (error) {
    console.error('Error activating user:', error);
    alert('Network error. Please try again.');
  }
};
```

### 5d. Add "Activate User" to Calendar View

**Location:** Calendar booking card (pending bookings)

Add button similar to Users Tab when viewing a booking with `status === 'pending'`.

---

## Task 6: Add sendLoginEmail helper function

**Location:** After sendActivationEmail (around line 430)

```typescript
async function sendLoginEmail(
  email: string,
  name: string,
  verificationToken: string,
  appUrl: string
): Promise<void> {
  const loginUrl = `${appUrl}/set-password?token=${verificationToken}`;

  await resend.emails.send({
    from: 'WellNest Pilates <noreply@wellnestpilates.com>',
    to: email,
    subject: 'Your WellNest Pilates Account is Activated!',
    html: `
      <h1>Welcome to WellNest Pilates!</h1>
      <p>Hi ${name},</p>
      <p>Your account has been activated. Click below to set your password and login:</p>
      <a href="${loginUrl}">Set Password & Login</a>
      <p>This link expires in 24 hours.</p>
    `
  });
}
```

---

## Migration SQL (if needed)

The `users` table may need `activation_status` and `payment_status` columns:

```sql
-- Add columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
```

---

## Verification Steps

After implementation:

1. **Test activation flow:**
   - Create a new package booking (user becomes pending)
   - Go to Admin Panel → Users tab
   - Click "Activate User" button
   - Verify: user status changes to activated
   - Verify: user receives login email

2. **Test auth/register:**
   - Register new user
   - Verify: user created in Supabase `users` table (not KV)

3. **Test auth/login:**
   - Login with registered user
   - Verify: user fetched from Supabase `users` table

4. **Test calendar view activation:**
   - View calendar with pending booking
   - Click "Activate User" on booking card
   - Verify: same behavior as Users tab

---

## Files Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `index.ts` | ~200 lines | Backend |
| `AdminPanel.tsx` | ~50 lines | Frontend |
| `migration.sql` | ~5 lines | Database |

---

## Order of Operations

1. Create migration SQL (add columns to users table if needed)
2. Add `sendLoginEmail` helper function
3. Rewrite `POST /activate` endpoint
4. Remove activation_code from `POST /packages`
5. Migrate `POST /auth/register` to Supabase
6. Migrate `POST /auth/login` to Supabase
7. Update AdminPanel.tsx (rename button, add function, fix bug)
8. Test all flows
9. Deploy
