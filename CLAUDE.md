# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Node.js/Express backend for the HENOC system - an invoice and request management platform. The system uses Sequelize ORM with MySQL, JWT authentication, and follows a controller-based architecture. It includes role-based access control (admin and superadmin), comprehensive logging, and PDF generation for invoices.

## Development Commands

```bash
# Development
npm run dev              # Start development server with nodemon (port 3015)
npm start               # Start production server

# Database Management
npm run migrate         # Run migrations (development)
npm run migrate:test    # Run migrations (test environment)
npm run migrate:prod    # Run migrations (production)
npm run migrate:undo    # Undo last migration
npm run seed            # Seed database with initial data
npm run db:reset        # Full database reset (dev): undo migrations, drop, create, migrate, seed

# Code Quality
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
```

## Architecture

### Core Structure

- **Controllers** (`/controllers/`): Business logic handlers that route to specific route files
  - Controllers import route modules from `/routes/{service}/` subdirectories
  - Example: `AuthController.js` imports routes from `/routes/auth/login.js`, `/routes/auth/logout.js`, etc.
  - Each controller acts as a router aggregator for a specific service domain

- **Routes** (`/routes/`): Organized by service domain (auth, admin, client, superadmin)
  - `/routes/auth/`: login, logout, me, refresh
  - `/routes/admin/`: request management, client management, invoices, payments, fee types
  - `/routes/client/`: client-facing request operations
  - `/routes/superadmin/`: admin management, system-wide fee types

- **Models** (`/models/`): Sequelize models with associations defined in each model file
  - `index.js` auto-loads all models and sets up associations
  - All models use UUIDs for primary keys
  - Key models: Admin, Client, Request, Invoice, Payment, Token, FeeType, Log

- **Middlewares** (`/middlewares/auth.js`):
  - `authenticate()`: JWT token validation with database token verification
  - `authorize(roles)`: Role-based access control
  - Both middlewares use the Logger utility for comprehensive audit trails

- **Utils** (`/utils/`):
  - `ApiResponse.js`: Standardized HTTP response helper (success, created, badRequest, unauthorized, notFound, serverError)
  - `TokenManager.js`: JWT token generation/validation, refresh token logic (superadmin tokens expire in 1h, admin tokens in 1d)
  - `Logger.js`: Event logging to database

- **Services** (`/services/`):
  - `PdfService.js`: Invoice PDF generation using Puppeteer

### Configuration

- **Environment-based config** (`/config/config.js`): Sequelize configuration for development/test/production
- **Multi-environment support**: Use `NODE_ENV` environment variable to switch between environments
- **Database credentials**: All credentials loaded from `.env` file (DB_DEV_*, DB_TEST_*, DB_PROD_*)
- **Port**: Default is 3015 (configurable via `PORT` env variable)

### Security Features

- JWT-based authentication with token storage in database
- Token revocation support (tokens can be invalidated)
- Rate limiting on auth endpoints (5 attempts per 15 minutes)
- Helmet for HTTP headers security
- CORS configuration (currently set to `*`, should be restricted in production)
- HPP (HTTP Parameter Pollution) protection
- Content Security Policy headers
- Request sanitization with express-sanitizer
- Comprehensive logging of all authentication/authorization events with IP tracking

### Authentication Flow

1. User logs in via `/auth/login` (rate-limited)
2. `TokenManager.generateAccessToken()` creates JWT and stores in `tokens` table
3. Access tokens expire based on role (1h for superadmin, 1d for admin)
4. Refresh tokens available for non-superadmin users (30-day expiry)
5. All protected routes use `authenticate()` middleware which:
   - Validates JWT signature
   - Checks token exists in database and is not revoked
   - Verifies token expiration
   - Attaches `req.admin`, `req.role`, `req.token` to request
6. Role-specific routes use `authorize([roles])` middleware

### API Documentation

- Swagger UI available at `/api-docs`
- Swagger spec configured in `/config/swagger.js`

## Important Patterns

- **Response consistency**: Always use `ApiResponse` utility methods for HTTP responses
- **Logging**: All authentication/authorization events are logged via `Logger.logEvent()` with structured data (source, userId, action, ipAddress, status, etc.)
- **Error handling**: Controllers should catch errors and use appropriate `ApiResponse` methods
- **Database transactions**: Use Sequelize transactions for multi-step operations
- **Token management**: Never manually create JWT tokens; always use `TokenManager` methods

## Environment Variables Required

Based on `/config/config.js`, ensure your `.env` includes:

```
# Database - Development
DB_DEV_USERNAME=
DB_DEV_PASSWORD=
DB_DEV_DATABASE=
DB_DEV_HOST=
DB_DEV_DIALECT=mysql

# Database - Test
DB_TEST_USERNAME=
DB_TEST_PASSWORD=
DB_TEST_DATABASE=
DB_TEST_HOST=
DB_TEST_DIALECT=mysql

# Database - Production
DB_PROD_USERNAME=
DB_PROD_PASSWORD=
DB_PROD_DATABASE=
DB_PROD_HOST=
DB_PROD_DIALECT=mysql

# JWT Secret
JWT_SECRET_DEV=

# Server
PORT=3015
```

## Key Migrations

- Database schema managed via Sequelize migrations in `/migrations/`
- Migration order is important due to foreign key constraints
- Key tables: admins, clients, requests, invoices, invoice_items, invoice_fees, payments, tokens, fee_types, logs
- All use UUIDs for primary/foreign keys

## Testing

Test environment runs on separate database configured via `NODE_ENV=test`:
```bash
npm run db:create:test    # Create test database
npm run migrate:test      # Run test migrations
npm run test             # Start test server with nodemon
```
