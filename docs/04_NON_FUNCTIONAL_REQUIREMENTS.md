# Arena Hub — Non-Functional Requirements

**Version:** 2.0

---

## NFR-01: Performance

| ID | Requirement | Constrains |
|---|---|---|
| NFR-01-1 | Login response time shall be under 2 seconds | FR-P-02 |
| NFR-01-2 | Arena search results shall return within 2 seconds | FR-P-04, FR-P-05 |
| NFR-01-3 | WebSocket slot updates shall reach clients within 500ms | FR-P-07 |
| NFR-01-4 | Redis lock acquire/release shall complete within 100ms | FR-P-08 |
| NFR-01-5 | Payment processing shall complete within 10 seconds | FR-P-09 |
| NFR-01-6 | Dashboard loading shall complete within 3 seconds | FR-O-09, FR-A-07 |
| NFR-01-7 | System shall support 1000+ concurrent active users | All FRs |

## NFR-02: Usability

| ID | Requirement | Constrains |
|---|---|---|
| NFR-02-1 | Mobile app shall be responsive for phones and tablets | FR-P-04 through FR-P-14 |
| NFR-02-2 | Web dashboard shall be responsive for desktop, laptop, tablet, and mobile | FR-O-01 through FR-A-07 |
| NFR-02-3 | Booking flow completable within 5 screen interactions | FR-P-08, FR-P-09 |
| NFR-02-4 | Clear error messages for all failed operations | All FRs |
| NFR-02-5 | Confirmation dialogs before irreversible actions (cancel, delete) | FR-P-11, FR-O-02 |

## NFR-03: Security

| ID | Requirement | Constrains |
|---|---|---|
| NFR-03-1 | JWT authentication on all protected API endpoints | FR-P-02, FR-O-01, FR-A-01 |
| NFR-03-2 | Access tokens expire after 15 minutes, refresh after 7 days | FR-P-02, FR-O-01, FR-A-01 |
| NFR-03-3 | Passwords hashed with BCrypt, never stored in plaintext | FR-P-01, FR-O-01 |
| NFR-03-4 | No payment card data stored on platform servers | FR-P-09 |
| NFR-03-5 | RBAC enforcement at API level for all three roles | FR-S-04 |
| NFR-03-6 | HTTPS with TLS 1.2+ for all client-server communication | All FRs |
| NFR-03-7 | OTP verification for new account registration | FR-P-01, FR-O-01 |
| NFR-03-8 | Account lockout after 5 failed login attempts | FR-P-02 |

## NFR-04: Reliability

| ID | Requirement | Constrains |
|---|---|---|
| NFR-04-1 | System shall maintain 99.5% uptime | All FRs |
| NFR-04-2 | Redis locks shall auto-expire to prevent deadlocks | FR-P-08, FR-S-01 |
| NFR-04-3 | Graceful handling of payment gateway failures | FR-P-09 |
| NFR-04-4 | WebSocket auto-reconnect after network interruptions | FR-P-07, FR-S-02 |
| NFR-04-5 | Database backups shall run daily with cloud recovery support | All data FRs |
| NFR-04-6 | Booking consistency maintained through ACID transactions | FR-P-08, FR-P-09 |

## NFR-05: Maintainability

| ID | Requirement | Constrains |
|---|---|---|
| NFR-05-1 | Backend services containerized with Docker | All FRs |
| NFR-05-2 | Single Docker Compose configuration for deployment | All FRs |
| NFR-05-3 | Modular service-based architecture for independent updates | All FRs |
| NFR-05-4 | Version control with Git, following branching strategy | All FRs |

## NFR-06: Compatibility

| ID | Requirement | Constrains |
|---|---|---|
| NFR-06-1 | Mobile app shall run on Android 8.0+ and iOS 13.0+ | FR-P-01 through FR-P-17 |
| NFR-06-2 | Mobile app shall support tablet and iPad screen sizes | FR-P-01 through FR-P-17 |
| NFR-06-3 | Web dashboard shall support Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ | FR-O-01 through FR-A-07 |
| NFR-06-4 | Backend shall run on Python 3.10+ with FastAPI | All FRs |

## NFR-07: Legal and Ethical

| ID | Requirement | Constrains |
|---|---|---|
| NFR-07-1 | No personal data shared with third parties without consent | FR-P-01, FR-O-01 |
| NFR-07-2 | Players shall be able to request account and data deletion | FR-P-03, FR-A-02 |
| NFR-07-3 | Refund policies shall be clearly displayed before payment | FR-P-09, FR-O-05 |

## NFR-08: Fault Isolation

| ID | Requirement | Constrains |
|---|---|---|
| NFR-08-1 | Payment gateway failure shall not prevent arena browsing | FR-P-09, FR-P-04 |
| NFR-08-2 | Notification service failure shall not block booking confirmation | FR-P-16, FR-P-10 |
| NFR-08-3 | AI recommendation failure shall not affect search functionality | FR-P-15, FR-P-04 |

---

End of Document
