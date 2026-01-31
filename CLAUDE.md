# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Frontend development
npm run dev          # Start Vite dev server
npm run build        # Production build

# Backend tests (Supabase Edge Functions with Deno)
npx deno test supabase/functions/make-server-b87b0c07/index.test.ts --allow-net

# Deploy Supabase function
supabase functions deploy make-server-b87b0c07
```

---

# WellNest Pilates - Master Overview

> **Zweck:** Gesamtkontext für alle Entwicklungsphasen. Lies dies ZUERST.

---

## PROJEKTZIEL

Eine funktionale Pilates-Studio Buchungs-App mit:
- User-Buchungsflow (Paket kaufen → Termine buchen)
- Admin-Panel (User verwalten, Kalender, Waitlist)
- Email-Benachrichtigungen (3 Sprachen: EN/SQ/MK)

**App URL:** https://app.wellnestpilates.com
**Stack:** React + TypeScript, Supabase (Postgres + Edge Functions), Hono Framework

---

## AKTUELLES KERNPROBLEM

```
Backend speichert ALLES in kv_store (Key-Value JSON-Blobs)
                    ↓
Echte Supabase-Tabellen werden IGNORIERT
                    ↓
Admin sieht 2 Test-User statt 11 echte User
```

**Lösung:** Migration von kv_store auf relationale Supabase-Tabellen.

---

## KRITISCHE BUGS (Stand 31.01.2026)

| # | Bug | Auswirkung |
|---|-----|------------|
| 1 | **Admin Users nicht verbunden** | Zeigt 2 Test-User statt 11 echte |
| 2 | **Admin Kalender nicht verbunden** | Mock-Daten statt 12 echte Reservierungen |
| 3 | **Waitlist zeigt 0** | Statt 103 echte Einträge |
| 4 | **Developer Tools in Production** | "Clear All Data" Button sichtbar! |
| 5 | **User aktivieren fehlt** | Kein Button nach Zahlung |
| 6 | **Email-Validierung fehlt** | "not-an-email" wird akzeptiert |
| 7 | **Admin-Aktionen falsch** | "Send Code" statt Activate/Block/Delete |

---

## PRODUKT-TYPEN

| Produkt | Sessions | Preis | Gültigkeit |
|---------|----------|-------|------------|
| Einzelklasse | 1 | TBD | - |
| 8er Paket | 8 | 3.500 DEN | 35 Tage |
| 10er Paket | 10 | TBD | 35 Tage |
| 12er Paket | 12 | TBD | 35 Tage |
| 1:1 Klasse | 1 | TBD | Individuell |
| DUO Klasse | 1 | TBD | Individuell |

> **Hinweis:** 1:1 und DUO sind aktuell nur Formular + Email, nicht vollständig implementiert.

**Redemption Codes:** +1 Bonus-Session bei Paket-Kauf (Waitlist-Belohnung)

---

## KERN-FLOWS

### Flow 1: Neukunde
```
Produkt wählen → Formular ausfüllen → Ersten Termin wählen
       ↓
Bestätigungs-Email → Status: PENDING
       ↓
Vor Ort bezahlen → Admin aktiviert → Aktivierungs-Email (Magic Link)
       ↓
Erstlogin (Passwort setzen) → Dashboard → Termine buchen
```

### Flow 2: Bestehender Kunde
```
Login → Dashboard (Paket-Status, nächster Termin) → Termin buchen/umbuchen
```

### Flow 3: Admin
```
Login → Kalender (Tagesübersicht) → User anklicken → Quick-Actions (✓/✗/⏸)
              ↓
         Users Tab → Pending aktivieren / User blockieren
              ↓
         Waitlist → Redemption Codes versenden
```

---

## AKTUELLE DATENBANK (Supabase)

```
Projekt-ID: azqkguctispoctvmpmci
Region: eu-central-1
```

| Tabelle | Records | Status |
|---------|---------|--------|
| `users` | 11 | Wird ignoriert (Admin zeigt Mock) |
| `reservations` | 12 | Wird ignoriert |
| `waitlist_members` | 103 | Wird ignoriert |
| `redemption_codes` | 103 | Funktioniert |
| `kv_store_b87b0c07` | 7 | WIRD FÄLSCHLICH GENUTZT |
| `user_bookings` | 0 | Leer |

---

## WAITLIST + REDEMPTION CODE FLOW

```
Waitlist Signup → waitlist_members (103 Einträge)
       ↓
Admin sendet Redemption Code Email (z.B. WN-CBQ7LE)
       ↓
User nutzt Code bei Paket-Buchung → +1 Bonus-Session
  • 8er Paket → 9 Sessions
  • 10er Paket → 11 Sessions
  • 12er Paket → 13 Sessions
```

---

## ZIEL-DATENBANKSCHEMA

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   users     │────<│ user_packages │────<│ reservations│
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │
       │            ┌──────┴──────┐
       │            │  packages   │ (Definitionen)
       │            └─────────────┘
       │
┌──────┴──────┐     ┌──────────────┐
│  sessions   │     │   admins     │
└─────────────┘     └──────────────┘

┌─────────────┐     ┌──────────────┐
│  waitlist   │     │ redemption   │
│  _members   │     │ _codes       │
└─────────────┘     └──────────────┘
```

---

## ALLE PHASEN

### Phase 0: DB-Migration (3-5 Tage) - AKTUELL
- SQL-Schema ausführen (neue Tabellen + Erweiterungen)
- 19 Endpoints von kv_store auf Supabase migrieren
- Daten-Migration (kv_store → echte Tabellen)
- kv-Import entfernen, Duplikate fixen

**Briefing:** `PHASE-0-DB-MIGRATION.md`

---

### Phase 1: Kritische Fixes (8-12 Tage)
| Task | Beschreibung |
|------|--------------|
| Admin: Echte Users anzeigen | `users` Tabelle statt Mock-Daten |
| Admin: Echte Reservations anzeigen | `reservations` Tabelle im Kalender |
| Admin: Echte Waitlist anzeigen | `waitlist_members` (103 Einträge) |
| Admin: User aktivieren Button | Status pending → active setzen |
| Aktivierungs-Email | Magic Link senden (NICHT Klartext-Passwort!) |
| User-Login funktionsfähig | Login → Session → Dashboard |
| Developer Tools entfernen | Aus Production Settings entfernen |

---

### Phase 2: Core Features / MVP (8-10 Tage)
| Task | Beschreibung |
|------|--------------|
| Kalender: Teilnehmer pro Slot | Klick auf Zeitslot → User-Liste |
| Quick-Actions | Anwesend / No-Show / Verschoben |
| User-Notizen | Freitext (Sprache, Gesundheit, etc.) |
| User Dashboard: Paket-Übersicht | Welches Paket, Sessions übrig |
| User Dashboard: Nächste Klasse | Datum + Countdown-Timer |
| Passwort ändern (Pflicht) | Bei Erstlogin erzwingen |
| Persistent Login | Session bleibt über Browser-Neustart |
| Email-Validierung | Ungültige Emails im Formular ablehnen |

---

### Phase 3: Self-Service (9-10 Tage)
| Task | Beschreibung |
|------|--------------|
| User: Termin umbuchen | Bis 24h vorher selbst ändern |
| User: Termin stornieren | Mit Cancellation Policy |
| Warteliste automatisch | Bei Stornierung → nächster rückt nach |
| No-Show Tracking | Nach 3x → automatische Warnung |
| Email-Erinnerungen | 24h + 1h vor Klasse |
| Settings: Klassen-Einstellungen | Max. Teilnehmer (4), Fristen |
| Settings: Paket-Preise | Admin kann Preise ändern |

---

### Phase 4: Growth Features (15-20 Tage)
| Task | Beschreibung |
|------|--------------|
| Push Notifications | Mobile Erinnerungen |
| Profilbild | Upload + Anzeige |
| Analytics Dashboard | Auslastung, Revenue, No-Shows |
| QR Check-in | User scannt → automatisch anwesend |
| Online-Zahlung (Stripe) | Kein Cash mehr nötig |
| Gamification | Nach X Klassen → Level up |
| Recurring Bookings | "Jeden Montag 9 Uhr" |
| 1:1 + DUO Flows | Komplette Buchungsflows |

---

## ARCHITEKTUR-ENTSCHEIDUNGEN

### Behalten (nicht ändern):
- **Hono Framework** für Routing
- **Resend** für Emails
- **3 Sprachen** (EN/SQ/MK) in Email-Templates
- **CORS** für app.wellnestpilates.com
- **Edge Functions** Struktur

### Ändern:
- **kv_store → Supabase-Tabellen**
- **Session-Token in kv → sessions Tabelle**
- **Service Role Key → Anon Key + RLS** (später)

### Konstanten (im Code definiert):
```typescript
TIME_SLOTS = ['09:00', '10:00', '11:00', '17:00', '18:00', '19:00', '20:00']
MAX_CAPACITY = 4 // pro Slot
PACKAGE_VALIDITY_DAYS = 35
```

---

## SECURITY-REGELN

1. **Keine Passwörter im Klartext** - Magic Links oder temporäre Tokens
2. **Passwort-Pflicht bei Erstlogin** - User muss eigenes PW setzen
3. **RLS aktivieren** auf allen Tabellen
4. **Admin-Auth separat** von User-Auth
5. **Session-Expiry** - Tokens laufen ab (z.B. 7 Tage)

---

## BEREITS ERLEDIGT (31.01.2026)

- [x] Dev Endpoints geschützt (/dev/clear-all-data, /dev/generate-mock-data)
- [x] CORS auf Production Domain beschränkt
- [x] Integration Tests hinzugefügt
- [x] Supabase Token rotiert

---

## SETTINGS BEST PRACTICE

**Entfernen:**
- Developer Tools (Generate Mock Data, Clear All Data)

**Hinzufügen (nach Priorität):**
```
Settings
├── Mein Konto (Phase 1)
│   ├── Passwort ändern
│   └── Logout
├── Klassen (Phase 2)
│   ├── Max. Teilnehmer (4)
│   └── Buchungs-/Stornierungsfrist
├── Pakete & Preise (Phase 2)
│   └── Preise änderbar
└── Studio (Phase 3)
    └── Name, Adresse, Logo
```

---

## QUICK WINS (jederzeit)

- [ ] Typo: "Payed" → "Paid"
- [ ] Kalender-Design verbessern (CSS)
- [ ] Developer Tools Button verstecken (UI)
- [ ] Email-Validierung im Formular

---

## BRIEFING-DATEIEN

| Datei | Inhalt | Status |
|-------|--------|--------|
| `MASTER-OVERVIEW.md` | Dieses Dokument | Done |
| `PHASE-0-DB-MIGRATION.md` | SQL + Endpoint-Migration | Done |
| `PHASE-1-CRITICAL-FIXES.md` | Admin Panel + Aktivierung | TODO |
| `PHASE-2-MVP-FEATURES.md` | Dashboard + Quick-Actions | TODO |

---

## WORKFLOW FÜR CLAUDE CODE

```
1. Lies CLAUDE.md (dieses Dokument)
2. Lies das aktuelle PHASE-X-BRIEFING.md
3. Arbeite Tasks der Reihe nach ab
4. Nach jeder Änderung: Testen
5. Bei Unklarheiten: Fragen stellen
```

---

## KONTEXT

**Studio:** WellNest Pilates
**Ort:** Gjuro Gjakovikj 59, Kumanovo 1300, North Macedonia
**Email:** hello@wellnestpilates.com
**Sprachen:** Albanisch (SQ), Mazedonisch (MK), Englisch (EN)

---

## KEY FILES

| File | Purpose |
|------|---------|
| `src/app/components/MainApp.tsx` | Screen routing & main state |
| `src/app/components/BookingScreen.tsx` | Date/time slot selection UI |
| `src/app/components/AdminPanel.tsx` | Admin calendar & user management |
| `supabase/functions/make-server-b87b0c07/index.ts` | Complete API |
| `supabase/functions/make-server-b87b0c07/kv_store.ts` | Database interface (to be migrated) |
