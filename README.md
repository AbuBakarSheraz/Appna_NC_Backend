# APPNA NC Backend

NestJS API for APPNA North Carolina membership, events, Square payments, ticket approvals, QR check-in, notifications, and email delivery.

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

For local development:

```bash
npm run start:dev
```

## Environment

Copy `.env.example` to `.env` and fill production values before deploying.

Required variables:

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/appna_nc
NODE_ENV=production
PORT=1018

FRONTEND_URL=https://appnanc.org
BACKEND_PUBLIC_URL=https://api.appnanc.org
APP_URL=https://api.appnanc.org
CORS_ORIGINS=https://appnanc.org,https://www.appnanc.org

MAIL_USER=dev.appnanc@gmail.com
MAIL_PASS=your-gmail-app-password
MAIL_ORG=appnanc@gmail.com

JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
JWT_EXPIRATION=7d
QR_SIGNING_SECRET=replace-with-a-separate-long-random-secret

SQUARE_ENVIRONMENT=sandbox
SQUARE_ACCESS_TOKEN=your-square-access-token
SQUARE_LOCATION_ID=your-square-location-id
SQUARE_API_VERSION=2026-05-20
SQUARE_WEBHOOK_SIGNATURE_KEY=your-square-webhook-signature-key
SQUARE_WEBHOOK_URL=https://api.appnanc.org/api/events/square/webhook
```

Use `SQUARE_ENVIRONMENT=sandbox` with sandbox Square credentials for local testing.

## Production Notes

Run `npx prisma migrate deploy` on production before starting the API. The latest migrations add Square payment tracking and multi-ticket requests.

The event flow supports one purchase request with multiple tickets. Each approved ticket gets its own ticket number, registration number, QR payload, and PNG attachment.

PayPal is no longer required for the current payment flow. Legacy PayPal database columns may remain for old records, but no PayPal env variables are needed.
