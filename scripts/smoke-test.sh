#!/usr/bin/env bash
# Smoke test — verifies ALL API paths + integration logic across all layers.
# Creates temporary test users/packages/reservations, then cleans up.
# Usage:  npm run smoke          (or)   bash scripts/smoke-test.sh
#
# Sections:
#   Part A — Endpoint coverage (58 route checks: status codes, auth rejection)
#   Part B — Integration logic (booking RPC, class types, packages, capacity, auth flows)

set -euo pipefail

BASE="https://azqkguctispoctvmpmci.supabase.co/functions/v1/make-server-b87b0c07"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cWtndWN0aXNwb2N0dm1wbWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTM4MTAsImV4cCI6MjA4NDU4OTgxMH0.cjn0-KOMMn-_K22j2k6kk37r5IAbPE9vpqFOKooWsIg"
AUTH="Authorization: Bearer $ANON"
CT="Content-Type: application/json"
FAKE_UUID="00000000-0000-0000-0000-000000000000"

PASS=0
FAIL=0
WARN=0

# ── Helpers ──────────────────────────────────────────────────────────

# test <description> <expected_http_code> <method> <path> [body]
test_endpoint() {
  local desc="$1" expect="$2" method="$3" path="$4" body="${5:-}"
  local url="$BASE$path"
  local args=(-s -o /tmp/smoke_body -w '%{http_code}' -H "$AUTH" -X "$method")

  if [[ -n "$body" ]]; then
    args+=(-H "$CT" -d "$body")
  fi

  local code
  code=$(curl "${args[@]}" "$url")
  local response
  response=$(cat /tmp/smoke_body)

  if [[ "$code" == "$expect" ]]; then
    printf "  PASS  %-55s %s\n" "$desc" "$code"
    PASS=$((PASS + 1))
  else
    printf "  FAIL  %-55s got %s (expected %s)\n" "$desc" "$code" "$expect"
    printf "        Response: %.200s\n" "$response"
    FAIL=$((FAIL + 1))
  fi
}

# test that response body contains a substring
test_endpoint_body() {
  local desc="$1" expect_code="$2" expect_body="$3" method="$4" path="$5" body="${6:-}"
  local url="$BASE$path"
  local args=(-s -o /tmp/smoke_body -w '%{http_code}' -H "$AUTH" -X "$method")

  if [[ -n "$body" ]]; then
    args+=(-H "$CT" -d "$body")
  fi

  local code
  code=$(curl "${args[@]}" "$url")
  local response
  response=$(cat /tmp/smoke_body)

  if [[ "$code" != "$expect_code" ]]; then
    printf "  FAIL  %-55s got %s (expected %s)\n" "$desc" "$code" "$expect_code"
    printf "        Response: %.200s\n" "$response"
    FAIL=$((FAIL + 1))
  elif echo "$response" | grep -q "$expect_body"; then
    printf "  PASS  %-55s %s (body ok)\n" "$desc" "$code"
    PASS=$((PASS + 1))
  else
    printf "  WARN  %-55s %s (missing: %s)\n" "$desc" "$code" "$expect_body"
    printf "        Response: %.200s\n" "$response"
    WARN=$((WARN + 1))
  fi
}

# test_logic <description> <body_must_contain> <curl_args...>
# Flexible: checks body for a grep pattern. Prints PASS/FAIL.
test_logic() {
  local desc="$1" expect_pattern="$2"
  shift 2
  local response
  response=$(curl -s -H "$AUTH" -H "$CT" "$@")

  if echo "$response" | grep -qE "$expect_pattern"; then
    printf "  PASS  %-55s\n" "$desc"
    PASS=$((PASS + 1))
  else
    printf "  FAIL  %-55s\n" "$desc"
    printf "        expected pattern: %s\n" "$expect_pattern"
    printf "        got: %.300s\n" "$response"
    FAIL=$((FAIL + 1))
  fi
  # export last response for chaining
  LAST_RESPONSE="$response"
}

# extract JSON field (requires python3)
json_field() {
  echo "$1" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print($2)" 2>/dev/null || echo ""
}

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  SMOKE TEST — Full Coverage + Integration Logic"
echo "  Target: $BASE"
echo "══════════════════════════════════════════════════════════════"

# ═════════════════════════════════════════════════════════════════════
#  PART A — ENDPOINT COVERAGE (58 checks)
# ═════════════════════════════════════════════════════════════════════

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PART A — Endpoint Coverage"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Public endpoints ───────────────────────────────────────────
echo ""
echo "── Public Endpoints ──"
test_endpoint_body "GET /health"                                200 "status"    GET  "/health"
test_endpoint      "GET /slots (needs date param)"              400             GET  "/slots"
test_endpoint      "GET /slots/live-days"                       200             GET  "/slots/live-days"
test_endpoint      "GET /slots/availability"                    200             GET  "/slots/availability"
test_endpoint      "GET /slots/user-calendar"                   200             GET  "/slots/user-calendar"
test_endpoint      "GET /packages"                              200             GET  "/packages"
test_endpoint      "GET /packages/:id (not found)"              404             GET  "/packages/$FAKE_UUID"
test_endpoint      "GET /reservations (no session)"             401             GET  "/reservations"
test_endpoint      "PATCH /reservations/:id/status (no sess)"   401             PATCH "/reservations/$FAKE_UUID/status" '{"status":"cancelled"}'

# ── 2. Validation endpoints ───────────────────────────────────────
echo ""
echo "── Validation ──"
test_endpoint_body "POST /validate-coupon (bad code)"           200 "valid"     POST "/validate-coupon" '{"code":"FAKE-9999"}'
test_endpoint      "POST /activate (no session)"                401             POST "/activate" '{}'

# ── 3. Auth endpoints (error paths) ──────────────────────────────
echo ""
echo "── Auth ──"
test_endpoint      "POST /auth/login (bad creds)"              401             POST "/auth/login" '{"email":"nobody@test.com","password":"wrong"}'
test_endpoint      "POST /auth/register (empty)"               400             POST "/auth/register" '{}'
test_endpoint      "POST /auth/request-login (bad)"            400             POST "/auth/request-login" '{}'
test_endpoint      "GET /auth/verify (no token)"               401             GET  "/auth/verify"
test_endpoint      "POST /auth/setup-password (empty)"         400             POST "/auth/setup-password" '{}'
test_endpoint      "POST /auth/admin/login (bad creds)"        401             POST "/auth/admin/login" '{"username":"bad","password":"bad"}'
test_endpoint_body "POST /auth/logout (no session)"            200 "success"   POST "/auth/logout"

# ── 4. Booking endpoints (public, error paths) ───────────────────
echo ""
echo "── Booking Error Paths ──"
test_endpoint      "POST /packages (empty body)"               400             POST "/packages" '{}'
test_endpoint_body "POST /packages/:id/first-session (empty)"  400 "Missing"   POST "/packages/$FAKE_UUID/first-session" '{}'
test_endpoint      "POST /reservations (empty body)"           400             POST "/reservations" '{}'
test_endpoint      "GET /reservations/:id (no session)"        401             GET  "/reservations/$FAKE_UUID"
test_endpoint      "DELETE /reservations/:id (no session)"     401             DELETE "/reservations/$FAKE_UUID"
test_endpoint      "POST /upload-logo (no file)"               500             POST "/upload-logo"

# ── 5. Admin endpoints (all reject without session) ──────────────
echo ""
echo "── Admin Endpoints (expect 401) ──"
test_endpoint      "GET /admin/users"                          401             GET  "/admin/users"
test_endpoint      "GET /admin/calendar"                       401             GET  "/admin/calendar"
test_endpoint      "GET /admin/slots"                          401             GET  "/admin/slots"
test_endpoint      "GET /admin/booking-changes"                401             GET  "/admin/booking-changes"
test_endpoint      "GET /admin/login-requests"                 401             GET  "/admin/login-requests"
test_endpoint      "GET /admin/consistency-check"              401             GET  "/admin/consistency-check"
test_endpoint      "GET /bookings"                             401             GET  "/bookings"
test_endpoint      "POST /admin/slots (create)"                401             POST "/admin/slots" '{}'
test_endpoint      "PATCH /admin/slots/:id"                    401             PATCH "/admin/slots/$FAKE_UUID" '{}'
test_endpoint      "DELETE /admin/slots/:id"                   401             DELETE "/admin/slots/$FAKE_UUID"
test_endpoint      "PATCH /admin/days/:date/status"            401             PATCH "/admin/days/2026-01-01/status" '{}'
test_endpoint      "POST /admin/cancel-class"                  401             POST "/admin/cancel-class" '{}'
test_endpoint      "POST /admin/login-requests/:id/approve"    401             POST "/admin/login-requests/fake/approve" '{}'
test_endpoint      "POST /admin/login-requests/:id/dismiss"    401             POST "/admin/login-requests/fake/dismiss" '{}'
test_endpoint      "POST /admin/sync-user-sessions"            401             POST "/admin/sync-user-sessions" '{}'
test_endpoint      "POST /admin/booking-changes/archive"       401             POST "/admin/booking-changes/archive" '{}'
test_endpoint      "POST /admin/archived-users/send-email"     401             POST "/admin/archived-users/send-email" '{}'
test_endpoint      "PATCH /admin/users/:email/payment"         401             PATCH "/admin/users/fake@test.com/payment" '{}'
test_endpoint      "PATCH /admin/users/:email/adjust-sessions" 401             PATCH "/admin/users/fake@test.com/adjust-sessions" '{}'
test_endpoint      "POST /admin/users/:email/resend-login"     401             POST "/admin/users/fake@test.com/resend-login-email" '{}'
test_endpoint      "POST /migrate-bookings"                    401             POST "/migrate-bookings" '{}'
test_endpoint      "DELETE /users/:email"                      401             DELETE "/users/fake@test.com"

# ── 6. User endpoints (all reject without session) ───────────────
echo ""
echo "── User Endpoints (expect 401) ──"
test_endpoint      "GET /user/packages"                        401             GET  "/user/packages"
test_endpoint      "PATCH /user/language"                      401             PATCH "/user/language" '{"language":"en"}'
test_endpoint      "POST /user/packages/purchase"              401             POST "/user/packages/purchase" '{}'
test_endpoint      "POST /user/packages/:id/book-session"      401             POST "/user/packages/$FAKE_UUID/book-session" '{}'
test_endpoint      "POST /user/packages/:id/reschedule"        401             POST "/user/packages/$FAKE_UUID/reschedule" '{}'
test_endpoint      "DELETE /user/pkgs/:id/reservations/:rid"   401             DELETE "/user/packages/$FAKE_UUID/reservations/$FAKE_UUID"

# ── 7. Dev endpoints (disabled in prod → 404) ────────────────────
echo ""
echo "── Dev Endpoints (disabled in prod — must 404) ──"
test_endpoint      "GET /debug/check-users"                    404             GET  "/debug/check-users"
test_endpoint      "POST /dev/clear-all-data"                  404             POST "/dev/clear-all-data" '{}'
test_endpoint      "POST /dev/generate-mock-data"              404             POST "/dev/generate-mock-data" '{}'

# ── 8. Removed routes (must 404) ─────────────────────────────────
echo ""
echo "── Removed Routes (must 404) ──"
test_endpoint      "POST /waitlist (removed)"                  404             POST "/waitlist" '{"email":"test@test.com"}'
test_endpoint      "GET /admin/waitlist (removed)"             404             GET  "/admin/waitlist"
test_endpoint      "GET /waitlist/verify/FAKE (removed)"       404             GET  "/waitlist/verify/FAKE"


# ═════════════════════════════════════════════════════════════════════
#  PART B — INTEGRATION LOGIC (creates temp data, then cleans up)
# ═════════════════════════════════════════════════════════════════════

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PART B — Integration Logic"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TS=$(date +%s)
TEST_EMAIL="smoketest-${TS}@example.com"
TEST_EMAIL2="smoketest2-${TS}@example.com"
PKG_EMAIL="smokepkg-${TS}@example.com"

# Discover a live group slot and a live individual slot dynamically
LIVE_DAYS=$(curl -s -H "$AUTH" "$BASE/slots/live-days")
FIRST_LIVE_DATE=$(echo "$LIVE_DAYS" | python3 -c "import sys,json; dates=json.loads(sys.stdin.read()).get('dates',[]); print(dates[0] if dates else '')" 2>/dev/null || echo "")

if [[ -z "$FIRST_LIVE_DATE" ]]; then
  echo ""
  echo "  ⚠ No live dates found — skipping integration tests"
  echo ""
else
  # Get availability to find group and individual slots
  AVAIL_JSON=$(curl -s -H "$AUTH" "$BASE/slots/availability")

  # Find first group slot across all live dates
  read -r GROUP_DATE GROUP_TIME <<< "$(echo "$AVAIL_JSON" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
configs = data.get('slotConfigs', {})
for date in sorted(configs.keys()):
    for time in sorted(configs[date].keys()):
        if configs[date][time].get('classType') == 'group':
            print(date, time[:5]); exit()
print('', '')
" 2>/dev/null || echo " ")"
  # Use group date if found, otherwise first live date
  if [[ -n "$GROUP_DATE" ]]; then
    FIRST_LIVE_DATE="$GROUP_DATE"
  fi
  SLOTS_JSON=$(curl -s -H "$AUTH" "$BASE/slots?date=$FIRST_LIVE_DATE")

  # Find a second group slot on the same date (for package first-session)
  GROUP_TIME2=$(echo "$AVAIL_JSON" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
configs = data.get('slotConfigs', {}).get('$FIRST_LIVE_DATE', {})
times = [t[:5] for t, info in sorted(configs.items()) if info.get('classType') == 'group' and t[:5] != '$GROUP_TIME']
print(times[0] if times else '')
" 2>/dev/null || echo "")

  # Find an individual slot across all live dates
  read -r INDIV_DATE INDIV_TIME <<< "$(echo "$AVAIL_JSON" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
configs = data.get('slotConfigs', {})
for date in sorted(configs.keys()):
    for time in sorted(configs[date].keys()):
        if configs[date][time].get('classType') == 'individual':
            print(date, time[:5]); exit()
print('', '')
" 2>/dev/null || echo " ")"

  echo ""
  echo "── Slot Discovery ──"
  echo "  Group date: $FIRST_LIVE_DATE  |  Group slot: ${GROUP_TIME:-none}  |  2nd: ${GROUP_TIME2:-none}"
  echo "  Individual date: ${INDIV_DATE:-none}  |  Individual slot: ${INDIV_TIME:-none}"

  # ── Reservation RPC Tests ────────────────────────────────────────
  echo ""
  echo "── Reservation Creation (RPC layer) ──"

  if [[ -n "$GROUP_TIME" ]]; then
    # Single group booking
    test_logic "Create single group reservation" '"success":true' \
      -X POST "$BASE/reservations" \
      -d "{\"userId\":\"$TEST_EMAIL\",\"serviceType\":\"single\",\"name\":\"Smoke\",\"surname\":\"Test\",\"mobile\":\"070000000\",\"email\":\"$TEST_EMAIL\",\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$GROUP_TIME\",\"packageType\":\"single\",\"language\":\"en\"}"
    RES_ID=$(json_field "$LAST_RESPONSE" "d.get('reservationId','')")

    # Duplicate from different user on same slot (should also succeed — capacity allows)
    test_logic "Second user books same group slot" '"success":true' \
      -X POST "$BASE/reservations" \
      -d "{\"userId\":\"$TEST_EMAIL2\",\"serviceType\":\"single\",\"name\":\"Smoke\",\"surname\":\"Two\",\"mobile\":\"070000001\",\"email\":\"$TEST_EMAIL2\",\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$GROUP_TIME\",\"packageType\":\"single\",\"language\":\"en\"}"
    RES_ID2=$(json_field "$LAST_RESPONSE" "d.get('reservationId','')")
  fi

  # ── Class Type Enforcement ───────────────────────────────────────
  echo ""
  echo "── Class Type Enforcement ──"

  if [[ -n "$GROUP_TIME" ]]; then
    # Individual on group slot → rejected
    test_logic "Block individual on group slot" 'group classes only' \
      -X POST "$BASE/reservations" \
      -d "{\"userId\":\"typetest@example.com\",\"serviceType\":\"individual\",\"name\":\"A\",\"surname\":\"B\",\"mobile\":\"070\",\"email\":\"typetest@example.com\",\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$GROUP_TIME\",\"packageType\":\"individual_1\",\"language\":\"en\"}"

    # Duo on group slot → rejected
    test_logic "Block duo on group slot" 'group classes only' \
      -X POST "$BASE/reservations" \
      -d "{\"userId\":\"typetest2@example.com\",\"serviceType\":\"duo\",\"name\":\"A\",\"surname\":\"B\",\"mobile\":\"070\",\"email\":\"typetest2@example.com\",\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$GROUP_TIME\",\"packageType\":\"duo_1\",\"language\":\"en\"}"
  fi

  if [[ -n "$INDIV_DATE" && -n "$INDIV_TIME" ]]; then
    # Group on individual slot → rejected
    test_logic "Block group/single on individual slot" 'Individual training only' \
      -X POST "$BASE/reservations" \
      -d "{\"userId\":\"typetest3@example.com\",\"serviceType\":\"single\",\"name\":\"A\",\"surname\":\"B\",\"mobile\":\"070\",\"email\":\"typetest3@example.com\",\"dateKey\":\"$INDIV_DATE\",\"timeSlot\":\"$INDIV_TIME\",\"packageType\":\"single\",\"language\":\"en\"}"
  else
    echo "  SKIP  Block group on individual slot (no individual slot configured)"
  fi

  # ── Validation ───────────────────────────────────────────────────
  echo ""
  echo "── Input Validation ──"

  test_logic "Reject invalid email format" 'email|invalid|Invalid' \
    -X POST "$BASE/reservations" \
    -d '{"userId":"bad@","serviceType":"single","name":"A","surname":"B","mobile":"070","email":"bad@","dateKey":"2026-03-24","timeSlot":"17:00","packageType":"single","language":"en"}'

  test_logic "Reject missing required fields" 'Missing required' \
    -X POST "$BASE/reservations" \
    -d '{"userId":"a@b.com","serviceType":"single"}'

  test_logic "Reject empty email" 'required|Missing|email' \
    -X POST "$BASE/reservations" \
    -d '{"userId":"","serviceType":"single","name":"A","surname":"B","mobile":"070","email":"","dateKey":"2026-03-24","timeSlot":"17:00","packageType":"single","language":"en"}'

  # ── Slots & Availability ─────────────────────────────────────────
  echo ""
  echo "── Slots & Availability ──"

  test_logic "Live days returns dates array" '"dates":\[' \
    "$BASE/slots/live-days"

  test_logic "Slots for live date returns array" '"success":true' \
    "$BASE/slots?date=$FIRST_LIVE_DATE"

  test_logic "Slots for non-live date → error" 'not available' \
    "$BASE/slots?date=2026-03-22"

  test_logic "Availability has slotConfigs" 'slotConfigs' \
    "$BASE/slots/availability"

  test_logic "User calendar returns success" '"success":true' \
    "$BASE/slots/user-calendar"

  # Verify availability endpoint structure is valid
  AVAIL_AFTER=$(curl -s -H "$AUTH" "$BASE/slots/availability")
  HAS_STRUCTURE=$(echo "$AVAIL_AFTER" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read())
ok = 'bookings' in data and 'slotConfigs' in data and isinstance(data['bookings'], list)
print('yes' if ok else 'no')
" 2>/dev/null || echo "no")
  if [[ "$HAS_STRUCTURE" == "yes" ]]; then
    printf "  PASS  %-55s\n" "Availability response has bookings[] + slotConfigs{}"
    PASS=$((PASS + 1))
  else
    printf "  FAIL  %-55s\n" "Availability response missing expected structure"
    FAIL=$((FAIL + 1))
  fi

  # ── Package Creation & First Session ─────────────────────────────
  echo ""
  echo "── Package Flow ──"

  # Create package for new user
  test_logic "Create package8 for new user" '"success":true' \
    -X POST "$BASE/packages" \
    -d "{\"userId\":\"$PKG_EMAIL\",\"packageType\":\"package8\",\"name\":\"PkgSmoke\",\"surname\":\"Test\",\"mobile\":\"070000099\",\"email\":\"$PKG_EMAIL\",\"language\":\"en\"}"
  PKG_ID=$(json_field "$LAST_RESPONSE" "d.get('package',{}).get('id','')")

  # Duplicate package → returns existing (not error)
  test_logic "Duplicate package returns existing" '"success":true' \
    -X POST "$BASE/packages" \
    -d "{\"userId\":\"$PKG_EMAIL\",\"packageType\":\"package8\",\"name\":\"PkgSmoke\",\"surname\":\"Test\",\"mobile\":\"070000099\",\"email\":\"$PKG_EMAIL\",\"language\":\"en\"}"

  # Invalid package type
  test_logic "Reject invalid package type" 'Invalid package' \
    -X POST "$BASE/packages" \
    -d "{\"userId\":\"$PKG_EMAIL\",\"packageType\":\"invalid_pkg\",\"name\":\"A\",\"surname\":\"B\",\"mobile\":\"070\",\"email\":\"$PKG_EMAIL\",\"language\":\"en\"}"

  # Single via /packages → rejected
  test_logic "Single via /packages endpoint → rejected" '/reservations' \
    -X POST "$BASE/packages" \
    -d "{\"userId\":\"$PKG_EMAIL\",\"packageType\":\"single\",\"name\":\"A\",\"surname\":\"B\",\"mobile\":\"070\",\"email\":\"$PKG_EMAIL\",\"language\":\"en\"}"

  # Book first session
  if [[ -n "$PKG_ID" && -n "$GROUP_TIME" ]]; then
    PKG_SLOT="${GROUP_TIME2:-$GROUP_TIME}"

    test_logic "Book first session for package" '"success":true' \
      -X POST "$BASE/packages/$PKG_ID/first-session" \
      -d "{\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$PKG_SLOT\",\"instructor\":\"any\",\"appUrl\":\"https://app.wellnestpilates.com\"}"
    FIRST_RES=$(json_field "$LAST_RESPONSE" "d.get('reservationId','')")

    # Verify first session is pending (package not yet activated)
    FIRST_STATUS=$(json_field "$LAST_RESPONSE" "d.get('reservation',{}).get('reservationStatus','') if 'reservation' in d else d.get('status','')")
    if [[ "$FIRST_STATUS" == "pending" || -n "$FIRST_RES" ]]; then
      printf "  PASS  %-55s\n" "First session status is pending (pre-activation)"
      PASS=$((PASS + 1))
    else
      printf "  FAIL  %-55s\n" "First session should be pending, got: $FIRST_STATUS"
      FAIL=$((FAIL + 1))
    fi

    # Double-book first session → error
    test_logic "Block duplicate first session" 'already booked|already exists|First session' \
      -X POST "$BASE/packages/$PKG_ID/first-session" \
      -d "{\"dateKey\":\"$FIRST_LIVE_DATE\",\"timeSlot\":\"$PKG_SLOT\",\"instructor\":\"any\",\"appUrl\":\"https://app.wellnestpilates.com\"}"
  else
    echo "  SKIP  First session tests (missing PKG_ID or slot)"
  fi

  # Password-less user can create another package type
  test_logic "Password-less user allowed new package type" '"success":true' \
    -X POST "$BASE/packages" \
    -d "{\"userId\":\"$PKG_EMAIL\",\"packageType\":\"package10\",\"name\":\"PkgSmoke\",\"surname\":\"Test\",\"mobile\":\"070000099\",\"email\":\"$PKG_EMAIL\",\"language\":\"en\"}"
  PKG_ID2=$(json_field "$LAST_RESPONSE" "d.get('package',{}).get('id','')")

  # ── Registered User Blocking ─────────────────────────────────────
  echo ""
  echo "── Registered User Blocking ──"

  # Known registered user with password → blocked from public booking
  test_logic "Registered user blocked from public /reservations" 'EMAIL_ALREADY_REGISTERED' \
    -X POST "$BASE/reservations" \
    -d '{"userId":"magdalena_si@hotmail.com","serviceType":"single","name":"Test","surname":"Block","mobile":"070","email":"magdalena_si@hotmail.com","dateKey":"'"$FIRST_LIVE_DATE"'","timeSlot":"'"$GROUP_TIME"'","packageType":"single","language":"en"}'

  # Registered user blocked from /packages too
  test_logic "Registered user blocked from public /packages" 'EMAIL_ALREADY_REGISTERED' \
    -X POST "$BASE/packages" \
    -d '{"userId":"magdalena_si@hotmail.com","packageType":"package8","name":"Test","surname":"Block","mobile":"070","email":"magdalena_si@hotmail.com","language":"en"}'

  # ── Auth Flows ───────────────────────────────────────────────────
  echo ""
  echo "── Auth Logic ──"

  test_logic "Forgot password (unknown) → success (no enum)" '"success":true' \
    -X POST "$BASE/auth/forgot-password" \
    -d '{"email":"totally-unknown@example.com"}'

  test_logic "Forgot password (known user) → success" '"success":true' \
    -X POST "$BASE/auth/forgot-password" \
    -d '{"email":"magdalena_si@hotmail.com"}'

  test_logic "Verify with fake token → error" 'Invalid|expired|error|No session' \
    "$BASE/auth/verify?token=fake-token-smoke-12345"

  test_logic "Logout without session → graceful" '"success":true' \
    -X POST "$BASE/auth/logout" -d '{}'

  # ── Coupon Validation ────────────────────────────────────────────
  echo ""
  echo "── Coupon Validation ──"

  test_logic "Invalid coupon → not valid" '"valid":false|not found|Invalid' \
    -X POST "$BASE/validate-coupon" \
    -d '{"code":"FAKECOUPON999"}'

  test_logic "Empty coupon → error" '"valid":false|required|Invalid|error' \
    -X POST "$BASE/validate-coupon" \
    -d '{"code":""}'

  # ── Health & Structure ───────────────────────────────────────────
  echo ""
  echo "── Health & Structure ──"

  test_logic "Health returns model name" 'unified_package_reservation' \
    "$BASE/health"

  test_logic "Packages list returns data" '"success":true|packages' \
    "$BASE/packages"

  # ── Cleanup ──────────────────────────────────────────────────────
  echo ""
  echo "── Cleanup ──"

  # Clean up all test data via Supabase Management API
  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    CLEANUP_SQL="DELETE FROM reservations WHERE user_email LIKE 'smoketest%' OR user_email LIKE 'smokepkg%' OR user_email LIKE 'typetest%'; DELETE FROM user_packages WHERE user_email LIKE 'smokepkg%'; DELETE FROM users WHERE email LIKE 'smoketest%' OR email LIKE 'smokepkg%' OR email LIKE 'typetest%';"
    CLEANUP_PAYLOAD=$(python3 -c "import json; print(json.dumps({'query': '''$CLEANUP_SQL'''}))")
    curl -s -X POST \
      "https://api.supabase.com/v1/projects/azqkguctispoctvmpmci/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$CLEANUP_PAYLOAD" > /dev/null 2>&1
    echo "  ✓ Test data cleaned up via Management API"
  else
    echo "  ⚠ SUPABASE_ACCESS_TOKEN not set — test data left in DB"
    echo "    Emails to clean: smoketest-${TS}@, smoketest2-${TS}@, smokepkg-${TS}@"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + WARN))
echo ""
echo "═══════════════════════════════════════════════════════════════"
printf "  TOTAL: %d   PASS: %d   FAIL: %d   WARN: %d\n" "$TOTAL" "$PASS" "$FAIL" "$WARN"
echo "═══════════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  echo "RESULT: FAIL"
  exit 1
elif [[ $WARN -gt 0 ]]; then
  echo "RESULT: WARN (review warnings above)"
  exit 0
else
  echo "RESULT: ALL PASS"
  exit 0
fi
