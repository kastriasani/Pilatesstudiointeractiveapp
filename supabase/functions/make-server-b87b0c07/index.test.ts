import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_URL = Deno.env.get("TEST_BASE_URL") ||
  "https://azqkguctispoctvmpmci.supabase.co/functions/v1/make-server-b87b0c07";

// ============ AUTH/LOGIN TESTS ============

Deno.test("POST /auth/login - missing fields returns 400", async () => {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("POST /auth/login - invalid credentials returns 401", async () => {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "nonexistent@example.com",
      password: "wrongpassword",
    }),
  });

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, "Invalid email or password");
});

// ============ AUTH/REGISTER TESTS ============

Deno.test("POST /auth/register - missing fields returns 400", async () => {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("POST /auth/register - missing password returns 400", async () => {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      name: "Test",
      surname: "User",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

// ============ PACKAGES TESTS ============

Deno.test("POST /packages - missing fields returns 400", async () => {
  const response = await fetch(`${BASE_URL}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Missing required fields");
});

Deno.test("POST /packages - invalid package type returns 400", async () => {
  const response = await fetch(`${BASE_URL}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "test@example.com",
      packageType: "invalid_type",
      name: "Test",
      surname: "User",
      mobile: "+1234567890",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Invalid package type");
});

Deno.test("POST /packages - single session rejected (use /reservations)", async () => {
  const response = await fetch(`${BASE_URL}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "test@example.com",
      packageType: "single",
      name: "Test",
      surname: "User",
      mobile: "+1234567890",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Use /reservations endpoint for single sessions");
});

// ============ DEV ENDPOINTS TESTS ============

Deno.test("POST /dev/clear-all-data - returns 404 when disabled", async () => {
  const response = await fetch(`${BASE_URL}/dev/clear-all-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.error, "Not found");
});

Deno.test("POST /dev/generate-mock-data - returns 404 when disabled", async () => {
  const response = await fetch(`${BASE_URL}/dev/generate-mock-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.error, "Not found");
});
