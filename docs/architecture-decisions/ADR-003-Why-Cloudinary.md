# ADR-003: Why Cloudinary for image storage

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
ArenaHub stores arena photos, profile pictures, and bank-transfer receipt
images. Storing binary blobs in PostgreSQL bloats the database and backups and
is poor practice. Self-hosting object storage (MinIO) or using AWS S3 adds
infra/billing overhead not justified for an FYP. Images need on-the-fly
resizing/optimization for mobile and web.

## Decision
Use **Cloudinary free tier** (25 GB storage / 25k transformations/month).
Store only the returned **secure URLs** in PostgreSQL, never raw bytes. In dev,
fall back to a local `backend/uploads/` directory if Cloudinary credentials
aren't configured.

## Consequences
- **Positive:** No infra to run; free tier is ample for FYP scale; built-in
  transformations (thumbnails, format/quality auto) offload image work from the
  backend; CDN delivery; simple SDK. Receipt-upload flow (bank transfer) is
  trivial to implement.
- **Negative / trade-offs:** External dependency and vendor lock-in on the URL
  shape; free-tier quotas could be hit under heavy load (not a concern at FYP
  scale); requires network access in dev unless the local fallback is used.
- **Mitigation:** All storage access goes through a single client in
  `app/integrations/`, so swapping to S3/MinIO later is a one-adapter change.
