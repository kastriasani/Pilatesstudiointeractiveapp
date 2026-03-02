#!/usr/bin/env bash
# Smoke test — verifies all API endpoints respond correctly after cleanup.
# No mock users created. Tests public endpoints + auth rejection on protected ones.
# Usage: bash scripts/smoke-test.sh

set -euo pipefail

BASE="https://azqkguctispoctvmpmci.supabase.co/functions/v1/make-server-b87b0c07"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cWtndWN0aXNwb2N0dm1wbWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTM4MTAsImV4cCI6MjA4NDU4OTgxMH0.cjn0-KOMMn-_K22j2k6kk37r5IAbPE9vpqFOKooWsIg"
AUTH="Authorization: Bearer $ANON"
CT="Content-Type: application/json"

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
    printf "  PASS  %-50s %s\n" "$desc" "$code"
    PASS=$((PASS + 1))
  else
    printf "  FAIL  %-50s got %s (expected %s)\n" "$desc" "$code" "$expect"
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
    printf "  FAIL  %-50s got %s (expected %s)\n" "$desc" "$code" "$expect_code"
    printf "        Response: %.200s\n" "$response"
    FAIL=$((FAIL + 1))
  elif echo "$response" | grep -q "$expect_body"; then
    printf "  PASS  %-50s %s (body ok)\n" "$desc" "$code"
    PASS=$((PASS + 1))
  else
    printf "  WARN  %-50s %s (missing: %s)\n" "$desc" "$code" "$expect_body"
    printf "        Response: %.200s\n" "$response"
    WARN=$((WARN + 1))
  fi
}

echo ""
echo "=== SMOKE TEST ==="
echo "Target: $BASE"
echo ""

# ── 1. Public endpoints (should return 200) ──────────────────────
echo "── Public Endpoints ──"
test_endpoint_body "GET /health"                   200 "status" GET "/health"
test_endpoint       "GET /slots (needs date param)"  400 GET "/slots"
test_endpoint       "GET /slots/live-days"          200 GET "/slots/live-days"
test_endpoint       "GET /slots/availability"       200 GET "/slots/availability"
test_endpoint       "GET /packages"                 200 GET "/packages"

# ── 2. Validation endpoints ──────────────────────────────────────
echo ""
echo "── Validation ──"
test_endpoint_body  "POST /validate-coupon (bad)"   200 "valid" POST "/validate-coupon" '{"code":"FAKE-9999"}'
test_endpoint       "POST /activate (no session)"   401 POST "/activate" '{}'

# ── 3. Auth endpoints (error paths) ─────────────────────────────
echo ""
echo "── Auth Error Handling ──"
test_endpoint       "POST /auth/login (bad creds)"  401 POST "/auth/login" '{"email":"nobody@test.com","password":"wrong"}'
test_endpoint       "POST /auth/register (empty)"   400 POST "/auth/register" '{}'
test_endpoint       "POST /auth/request-login (bad)" 400 POST "/auth/request-login" '{}'
test_endpoint       "GET /auth/verify (no token)"   401 GET "/auth/verify"
test_endpoint       "POST /auth/setup-password (empty)" 400 POST "/auth/setup-password" '{}'

# ── 4. Protected endpoints (should reject without session) ──────
echo ""
echo "── Protected Endpoints (expect 401/403) ──"
test_endpoint       "GET /admin/users (no session)"      401 GET "/admin/users"
test_endpoint       "GET /admin/calendar (no session)"   401 GET "/admin/calendar"
test_endpoint       "GET /admin/booking-changes (no session)" 401 GET "/admin/booking-changes"
test_endpoint       "GET /admin/login-requests (no session)" 401 GET "/admin/login-requests"
test_endpoint       "GET /admin/slots (no session)"      401 GET "/admin/slots"
test_endpoint       "GET /user/packages (no session)"    401 GET "/user/packages"
test_endpoint       "PATCH /user/language (no session)"  401 PATCH "/user/language" '{"language":"en"}'

# ── 5. Booking endpoints (public, error paths) ──────────────────
echo ""
echo "── Booking Error Paths ──"
test_endpoint       "POST /packages (empty body)"        400 POST "/packages" '{}'
test_endpoint       "POST /reservations (empty body)"    400 POST "/reservations" '{}'
test_endpoint       "GET /reservations/:id (no session)"  401 GET "/reservations/fake-id-12345"
test_endpoint       "DELETE /reservations/:id (no session)" 401 DELETE "/reservations/fake-id-12345"

# ── 6. Verify no waitlist routes exist ──────────────────────────
echo ""
echo "── Waitlist Routes (removed — must 404) ──"
test_endpoint       "POST /waitlist (removed)"           404 POST "/waitlist" '{"email":"test@test.com"}'
test_endpoint       "GET /admin/waitlist (removed)"      404 GET "/admin/waitlist"
test_endpoint       "GET /waitlist/verify/FAKE (removed)" 404 GET "/waitlist/verify/FAKE"

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
printf "  PASS: %d   FAIL: %d   WARN: %d\n" "$PASS" "$FAIL" "$WARN"
echo "═══════════════════════════════════════"

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
