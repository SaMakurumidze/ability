# Ability x PrivateEx Integration

## Purpose

Ability Wallet is the authorization and settlement layer for PrivateEx pre-IPO investments.

## Core flow

1. PrivateEx sends `POST /api/investments/request` to Ability.
2. Ability creates/updates a `pending_investments` record with status `pending_authorization`.
3. Investor authorizes or declines in Ability mobile (`Invest` modal).
4. Ability performs double-entry ledger posting (on authorize), settles escrow to company wallet, and sends webhook to PrivateEx.

## API contracts

### 1) Create pending investment request

`POST /api/investments/request`

Headers:

- `x-privateex-key: <PRIVATEEX_API_KEY>` (if configured)

Payload:

```json
{
  "investment_request_id": "uuid",
  "user_id": "uuid",
  "company_id": "uuid",
  "share_quantity": 100,
  "total_amount": 5000,
  "currency": "USD",
  "origin": "privateex"
}
```

Response:

```json
{
  "status": "pending_authorization",
  "ability_reference_id": "same-as-investment_request_id"
}
```

### 2) Authorize (mobile user action)

`POST /api/pending-investments/:id/authorize`

Body:

```json
{ "pin": "123456" }
```

Notes:

- Idempotent for already authorized records (`{ ok: true, idempotent: true }`)
- Uses transaction PIN check.
- Performs atomic settlement and ledger writes.

### 3) Decline (mobile user action)

`POST /api/pending-investments/:id/decline`

Body:

```json
{ "pin": "123456" }
```

Effect: marks investment as `rejected`.

Compatibility note: `POST /api/pending-investments/:id/cancel` is kept as an alias for older clients.

## Webhook callback to PrivateEx

Target:

- `PRIVATEEX_WEBHOOK_URL` (default: `https://www.privateex.online/api/ability/investment-status`)

Payload:

```json
{
  "investment_request_id": "uuid",
  "ability_reference_id": "uuid",
  "status": "authorized|rejected",
  "timestamp": "ISO-8601"
}
```

Headers:

- `x-ability-key` (if configured)
- `x-ability-signature`: HMAC SHA-256 over raw JSON payload using `PRIVATEEX_WEBHOOK_SECRET` (fallback `PRIVATEEX_API_KEY`)

## Double-entry model (authorize path)

For amount `A`:

1. Investor wallet: debit `A`
2. Escrow wallet: credit `A`
3. Escrow wallet: debit `A`
4. Company wallet: credit `A`

All entries use:

- `reference_type = "investment"`
- `reference_id = investment_request_id`

## Required environment variables

- `PRIVATEEX_API_KEY` (request auth + optional callback header)
- `PRIVATEEX_WEBHOOK_URL`
- `PRIVATEEX_WEBHOOK_SECRET` (for signature generation)
- `PLATFORM_ESCROW_ENTITY_ID` (UUID for escrow platform entity)

## Company wallet bootstrap

Admin endpoint:

`POST /api/admin/companies/upsert`

This creates/updates company metadata and ensures a `company_wallet` account exists.
