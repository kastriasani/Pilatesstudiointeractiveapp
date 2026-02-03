# User Booking Interface - With Mock Data

## Interface Layout (Based on Screenshot)

### 📱 Mobile View (440×956px - iPhone 16 Pro)

---

## Header
```
← Rezervim klasë të vetme
```
(Back to Single Class Booking)

---

## Date Selection Tabs
```
┌──────────┬──────────┬──────────┬───────────┐
│ E PREMTE │ E HËNË   │ E MARTË  │ E MËRKURË │
│ 23 Janar │ 26 Janar │ 27 Janar │ 28 Janar  │
└──────────┴──────────┴──────────┴───────────┘
```

**Navigation**: Horizontal scroll to view more dates through Feb 28

---

## Time Slots View (Albanian Example)

Each slot shows:
- Time range
- Availability status button

```
┌─────────────────────────────────────────────┐
│  08:00 - 08:50          [4 vende të lira]  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  09:00 - 09:50          [4 vende të lira]  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  10:00 - 10:50          [3 vende të lira]  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  11:00 - 11:50          [4 vende të lira]  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  16:00 - 16:50          [2 vende të lira]  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  17:00 - 17:50          [1 vend i lirë]    │
└────��────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  18:00 - 18:50          [4 vende të lira]  │
└─────────────────────────────────────────────┘
```

**Footer**
```
W

Gjuro Gjakovčki 59, Kumanovo 1300
© 2025 Wellnest Pilates
```

---

## Multi-Language Support

### Albanian (sq)
- "vende të lira" = spots available
- "vend i lirë" = spot available
- "E PREMTE" = Friday
- "Janar" = January

### Macedonian (mk)
- "слободни места" = spots available
- "слободно место" = spot available
- "ПЕТОК" = Friday
- "Јануари" = January

### English (en)
- "spots available" = spots available
- "spot available" = spot available
- "FRIDAY" = Friday
- "January" = January

---

## Availability Scenarios with Mock Data

### Example 1: Light Day (Jan 23)
```
08:00 - 08:50    [4 spots available] ← All free
09:00 - 09:50    [3 spots available] ← 1 booked
10:00 - 10:50    [4 spots available] ← All free
11:00 - 11:50    [4 spots available] ← All free
16:00 - 16:50    [3 spots available] ← 1 booked
17:00 - 17:50    [2 spots available] ← 2 booked
18:00 - 18:50    [4 spots available] ← All free

Total booked: 4 bookings on this day
```

### Example 2: Medium Day (Feb 5)
```
08:00 - 08:50    [2 spots available] ← 2 booked
09:00 - 09:50    [3 spots available] ← 1 booked
10:00 - 10:50    [2 spots available] ← 2 booked
11:00 - 11:50    [3 spots available] ← 1 booked
16:00 - 16:50    [1 spot available]  ← 3 booked
17:00 - 17:50    [2 spots available] ← 2 booked
18:00 - 18:50    [3 spots available] ← 1 booked

Total booked: 12 bookings on this day
```

### Example 3: Busy Day (Feb 14)
```
08:00 - 08:50    [1 spot available]  ← 3 booked
09:00 - 09:50    [2 spots available] ← 2 booked
10:00 - 10:50    [0 spots available] ← FULL (4/4)
11:00 - 11:50    [2 spots available] ← 2 booked
16:00 - 16:50    [0 spots available] ← FULL (4/4)
17:00 - 17:50    [1 spot available]  ← 3 booked
18:00 - 18:50    [2 spots available] ← 2 booked

Total booked: 18 bookings on this day
```

---

## Dynamic Button States

### Available Slots
```css
background: #9ca571 (olive green)
color: white
text: "4 vende të lira"
action: Click to book
```

### Low Availability
```css
background: #d4a574 (warm orange)
color: white
text: "1 vend i lirë"
action: Click to book (hurry!)
```

### Fully Booked
```css
background: #cccccc (gray)
color: #666666
text: "Asnjë vend i lirë"
action: Disabled (cannot click)
```

---

## Booking Flow After Selection

1. **User selects date tab**: "27 Janar"
2. **User clicks time slot**: "17:00 - 17:50 [2 vende të lira]"
3. **Shows instructor selection** (if multiple instructors)
4. **Confirmation screen** with:
   - Date: E Martë, 27 Janar 2026
   - Time: 17:00 - 17:50
   - Instructor: Instructor 2
   - Package: Uses 1 session from package
   - Sessions remaining: 9 (after booking)
5. **Instant booking** (no countdown if logged in)
6. **Success message**: "Rezervimi juaj është konfirmuar!"

---

## Logged In vs Logged Out

### Logged In User
- **Shows**: Package info, sessions remaining
- **Booking**: Instant confirmation
- **Payment**: Deducted from package
- **View**: "My Bookings" section shows all reservations

### Guest Booking (Not Logged In)
- **Shows**: Available slots
- **Booking**: 30-minute countdown timer
- **Payment**: Choose "Pay in Studio" or prepay
- **Email**: Receives activation code (WN-XXXX-XXXX)
- **Access**: Can login with code to manage booking

---

## Week Navigation Example

### Week 1 (Jan 23-24)
```
[E PREMTE 23 Janar] → [E SHTUNË 24 Janar] → [Skip Weekend] →
```

### Week 2 (Jan 27-31)
```
[E HËNË 27 Janar] → [E MARTË 28 Janar] → [E MËRKURË 29 Janar] → 
[E ENJTE 30 Janar] → [E PREMTE 31 Janar] → [Skip Weekend] →
```

### Week 3 (Feb 2-6)
```
[E HËNË 2 Shkurt] → [E MARTË 3 Shkurt] → [E MËRKURË 4 Shkurt] → 
[E ENJTE 5 Shkurt] → [E PREMTE 6 Shkurt] → [Skip Weekend] →
```

... continues through Feb 27

---

## Real-Time Availability Updates

With 100 mock users making bookings:

**08:00 Slot Progression**
```
Jan 23: [4/4 free]
Jan 24: [3/4 free] ← 1 booking made
Jan 27: [4/4 free]
Jan 28: [2/4 free] ← 2 bookings made
Jan 29: [3/4 free] ← 1 booking made
```

**17:00 Slot (Peak Hour) Progression**
```
Jan 23: [2/4 free] ← Popular time
Jan 24: [1/4 free] ← Very popular
Jan 27: [3/4 free]
Jan 28: [0/4 FULL] ← Fully booked!
Jan 29: [2/4 free]
```

---

## User Experience Features

1. ✅ **Instant Visibility**: See all availability at a glance
2. ✅ **Color Coding**: Green (lots), Orange (few), Gray (none)
3. ✅ **Smart Scrolling**: Horizontal date navigation
4. ✅ **Mobile Optimized**: Perfect fit for 440px width
5. ✅ **No Scrolling**: All 7 slots visible without scrolling
6. ✅ **Clear Capacity**: "4 vende të lira" is explicit
7. ✅ **Multi-week View**: Easily navigate through February
8. ✅ **Responsive Design**: Adapts to language text length

---

## Mock Data Impact on User Interface

With **200-400 bookings** spread across **26 days** and **182 slots**:

- **Most slots** show 3-4 spots available (plenty of choice)
- **Some slots** show 1-2 spots available (creates urgency)
- **Few slots** are fully booked (realistic capacity limits)
- **Every day** has bookings (active, thriving studio)
- **Variety** in availability patterns (realistic user behavior)

**Perfect Balance**: Enough bookings to show activity, enough availability to allow new bookings!

---

## Technical Implementation

```typescript
interface TimeSlot {
  time: string;          // "08:00"
  endTime: string;       // "08:50"
  capacity: number;      // 4
  booked: number;        // 0-4
  available: number;     // 4 - booked
  bookings: Booking[];   // Array of booking objects
  instructor?: string;   // "Instructor 1"
}

interface DayView {
  date: Date;            // 2026-01-23
  dateKey: string;       // "1-23"
  dayName: string;       // "E PREMTE"
  slots: TimeSlot[];     // Array of 7 slots
  totalBooked: number;   // Sum of all bookings
}
```

**Dynamic Text**:
```typescript
const getSpotsText = (available: number, language: string) => {
  if (available === 0) {
    return { sq: 'Asnjë vend i lirë', mk: 'Нема слободни места', en: 'No spots available' };
  }
  if (available === 1) {
    return { sq: '1 vend i lirë', mk: '1 слободно место', en: '1 spot available' };
  }
  return { sq: `${available} vende të lira`, mk: `${available} слободни места`, en: `${available} spots available` };
};
```

---

## Summary

The user booking interface with mock data provides:

- ✅ **Complete month view** (Jan 23 - Feb 28)
- ✅ **Realistic availability** (not too empty, not too full)
- ✅ **Multi-language support** (Albanian/Macedonian/English)
- ✅ **Mobile-first design** (fits iPhone 16 Pro perfectly)
- ✅ **Clear capacity indicators** ("4 vende të lira")
- ✅ **Interactive booking flow** (select → confirm → success)
- ✅ **User dashboard integration** (view all bookings)
- ✅ **Admin panel sync** (same data across all views)

**Result**: A professional, fully functional booking system ready for demonstration and testing!
