# API contract

The single source of truth for how `web`, `api`, and `e2e` talk to each other.
Change this file in its own PR before changing the code on either side.

`items` is a placeholder resource until the real feature is decided.

## GET /health

```http
GET /health
→ 200 {"status":"ok","db":"ok","version":"a1b2c3d","uptimeSec":3600}
```

## GET /items

```http
GET /items
→ 200 [{"id":1,"title":"Example","createdAt":"2026-10-26T12:00:00Z"}]
```

## POST /items

```http
POST /items
{"title":"Example"}
→ 201 {"id":2,"title":"Example","createdAt":"2026-10-26T12:00:00Z"}
→ 400 {"error":"VALIDATION_ERROR","message":"title required"}
```

## Database

```sql
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Fake data

Keep these two files identical:

- `api/src/fixtures/items.json`
- `web/lib/fixtures.ts`
