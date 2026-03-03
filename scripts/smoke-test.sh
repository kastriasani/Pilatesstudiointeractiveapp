#!/usr/bin/env bash
# Smoke test — verifies ALL 50 unique API paths (55 method+path combos) respond correctly.
# No mock users created. Tests public endpoints + auth rejection on protected ones.
# Usage: bash scripts/smoke-test.sh
#
# Coverage: every route in docs/generated/api-manifest.json + 3 removed-route 404 checks.

set -euo pipefail

BASE="https://azqkguctispoctvmpmci.supabase.co/functions/v1/make-server-b87b0c07"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cWtndWN0aXNwb2N0dm1wbWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTM4MTAsImV4cCI6MjA4NDU4OTgxMH0.cjn0-KOMMn-_K22j2k6kk37r5IAbPE9vpqFOKooWsIg"
AUTH="Authorization: Bearer $ANON"
CT="Content-Type: application/json"
FAKE_UUID="00000000-0000-0000-0000-000000000000"

PASS=0
FAIL=0
WARN=0

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

echo ""
echo "=== SMOKE TEST (full coverage) ==="
echo "Target: $BASE"
echo ""

# ── 1. Public endpoints ───────────────────────────────────────────
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

# ── Summary ───────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + WARN))
echo ""
echo "═══════════════════════════════════════════"
printf "  TOTAL: %d   PASS: %d   FAIL: %d   WARN: %d\n" "$TOTAL" "$PASS" "$FAIL" "$WARN"
echo "═══════════════════════════════════════════"

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
