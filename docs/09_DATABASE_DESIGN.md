# Arena Hub — Database Design (PostgreSQL)

**Version:** 2.0  
**Database:** PostgreSQL  
**ORM:** SQLAlchemy (with Alembic for migrations)

---

## 1. Why PostgreSQL

Initially MongoDB was selected for flexibility. After analysis, PostgreSQL was chosen because:
- Arena Hub is a transactional booking system requiring data consistency
- Bookings, payments, refunds have clear relational structures
- ACID transactions are critical for reservation and payment integrity
- Foreign keys enforce referential integrity
- Complex JOINs needed for reporting and analytics
- Better alignment with examiner expectations for booking systems

Redis continues to be used for distributed locking and caching.

---

## 2. Database Schema

### users
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| full_name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| phone | VARCHAR(20) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | ENUM('player','owner','admin') | NOT NULL |
| profile_picture | VARCHAR(500) | NULLABLE |
| bio | TEXT | NULLABLE |
| preferred_sports | JSONB | DEFAULT '[]' |
| preferred_locations | JSONB | DEFAULT '[]' |
| is_verified | BOOLEAN | DEFAULT FALSE |
| is_active | BOOLEAN | DEFAULT TRUE |
| failed_login_attempts | INTEGER | DEFAULT 0 |
| locked_until | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### arenas
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| owner_id | UUID | FK → users(id), NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | NULLABLE |
| address | TEXT | NOT NULL |
| city | VARCHAR(100) | NOT NULL |
| area | VARCHAR(100) | NULLABLE |
| latitude | DECIMAL(10,7) | NOT NULL |
| longitude | DECIMAL(10,7) | NOT NULL |
| contact_phone | VARCHAR(20) | NULLABLE |
| contact_email | VARCHAR(255) | NULLABLE |
| operating_hours | JSONB | NOT NULL |
| sports_offered | JSONB | NOT NULL |
| images | JSONB | DEFAULT '[]' |
| status | ENUM('pending','approved','rejected') | DEFAULT 'pending' |
| rejection_reason | TEXT | NULLABLE |
| advance_percentage | INTEGER | DEFAULT 100 |
| require_full_payment | BOOLEAN | DEFAULT TRUE |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### amenities
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| name | VARCHAR(100) | UNIQUE, NOT NULL |
| icon | VARCHAR(50) | NULLABLE |

**Seed Data:** Parking, Washroom, Shower, Canteen, WiFi, First Aid, Drinking Water, Changing Room, Floodlights, Seating Area, CCTV, Locker Room

### arena_amenities
| Column | Type | Constraints |
|---|---|---|
| arena_id | UUID | FK → arenas(id) |
| amenity_id | UUID | FK → amenities(id) |
| | | PRIMARY KEY (arena_id, amenity_id) |

### courts
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| arena_id | UUID | FK → arenas(id), NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| sport_types | JSONB | NOT NULL |
| capacity | INTEGER | NULLABLE |
| base_price | DECIMAL(10,2) | NOT NULL |
| is_available | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT NOW() |

### peak_pricing_rules
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| court_id | UUID | FK → courts(id), NOT NULL |
| day_of_week | INTEGER | 0-6 (Mon-Sun), NULLABLE (all days if null) |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| peak_price | DECIMAL(10,2) | NOT NULL |

### time_slots
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| court_id | UUID | FK → courts(id), NOT NULL |
| date | DATE | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| status | ENUM('available','reserved','booked','maintenance') | DEFAULT 'available' |
| price | DECIMAL(10,2) | NOT NULL |
| | | UNIQUE (court_id, date, start_time) |

### bookings
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| player_id | UUID | FK → users(id), NOT NULL |
| arena_id | UUID | FK → arenas(id), NOT NULL |
| court_id | UUID | FK → courts(id), NOT NULL |
| slot_id | UUID | FK → time_slots(id), NOT NULL |
| booking_date | DATE | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| total_amount | DECIMAL(10,2) | NOT NULL |
| advance_amount | DECIMAL(10,2) | DEFAULT 0 |
| remaining_amount | DECIMAL(10,2) | DEFAULT 0 |
| payment_type | ENUM('full','advance') | NOT NULL |
| status | ENUM('pending_payment','pending_approval','confirmed','completed','cancelled','rejected') | DEFAULT 'pending_payment' |
| cancellation_reason | TEXT | NULLABLE |
| refund_eligible | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### payments
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| booking_id | UUID | FK → bookings(id), NOT NULL |
| player_id | UUID | FK → users(id), NOT NULL |
| amount | DECIMAL(10,2) | NOT NULL |
| currency | VARCHAR(3) | DEFAULT 'PKR' |
| payment_method | ENUM('stripe','jazzcash','easypaisa') | NOT NULL |
| gateway_transaction_id | VARCHAR(255) | NULLABLE |
| status | ENUM('pending','completed','failed','refunded') | NOT NULL |
| payment_type | ENUM('full','advance') | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

### refunds
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| booking_id | UUID | FK → bookings(id), NOT NULL |
| payment_id | UUID | FK → payments(id), NOT NULL |
| amount | DECIMAL(10,2) | NOT NULL |
| reason | TEXT | NOT NULL |
| status | ENUM('pending','processed','failed') | DEFAULT 'pending' |
| processed_at | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |

### refund_policies
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| arena_id | UUID | FK → arenas(id), NOT NULL |
| hours_before | INTEGER | NOT NULL |
| refund_percentage | INTEGER | NOT NULL (0-100) |
| | | UNIQUE (arena_id, hours_before) |

### reviews
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| player_id | UUID | FK → users(id), NOT NULL |
| arena_id | UUID | FK → arenas(id), NOT NULL |
| booking_id | UUID | FK → bookings(id), NOT NULL |
| rating | INTEGER | CHECK (1-5), NOT NULL |
| review_text | TEXT | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| | | UNIQUE (booking_id) |

### equipment
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| arena_id | UUID | FK → arenas(id), NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | NULLABLE |
| rental_price | DECIMAL(10,2) | NOT NULL |
| quantity_total | INTEGER | NOT NULL |
| quantity_available | INTEGER | NOT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |

### booking_equipment
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| booking_id | UUID | FK → bookings(id), NOT NULL |
| equipment_id | UUID | FK → equipment(id), NOT NULL |
| quantity | INTEGER | NOT NULL |
| total_price | DECIMAL(10,2) | NOT NULL |

### liked_arenas
| Column | Type | Constraints |
|---|---|---|
| player_id | UUID | FK → users(id) |
| arena_id | UUID | FK → arenas(id) |
| created_at | TIMESTAMP | DEFAULT NOW() |
| | | PRIMARY KEY (player_id, arena_id) |

### notifications
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| user_id | UUID | FK → users(id), NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| body | TEXT | NOT NULL |
| type | VARCHAR(50) | NOT NULL |
| is_read | BOOLEAN | DEFAULT FALSE |
| data | JSONB | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |

### complaints
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| player_id | UUID | FK → users(id), NOT NULL |
| category | VARCHAR(50) | NOT NULL |
| description | TEXT | NOT NULL |
| status | ENUM('open','under_review','resolved') | DEFAULT 'open' |
| admin_response | TEXT | NULLABLE |
| resolved_at | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |

---

## 3. Key Relationships

```
users (1) ──→ (N) arenas [owner_id]
users (1) ──→ (N) bookings [player_id]
users (1) ──→ (N) reviews [player_id]
arenas (1) ──→ (N) courts
arenas (N) ←──→ (N) amenities [via arena_amenities]
courts (1) ──→ (N) time_slots
courts (1) ──→ (N) peak_pricing_rules
bookings (1) ──→ (1) time_slots [slot_id]
bookings (1) ──→ (N) payments
bookings (1) ──→ (N) booking_equipment
bookings (1) ──→ (0-1) reviews
arenas (1) ──→ (N) equipment
arenas (1) ──→ (N) refund_policies
```

---

## 4. Indexes

- `users`: email (unique), phone (unique)
- `arenas`: owner_id, status, city, (latitude, longitude)
- `courts`: arena_id, is_available
- `time_slots`: (court_id, date, start_time) unique, status
- `bookings`: player_id, arena_id, status, booking_date
- `payments`: booking_id, status
- `reviews`: arena_id, player_id

---

End of Document
