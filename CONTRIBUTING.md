# Development Standards & Contribution Guidelines

This document codifies the **Senior Fullstack** standards for Range Anxiety Rider. Adhering to these ensures the project remains secure, maintainable, and bug-free as a solo developer or as the team grows.

## 🏛️ Architectural Mandates

### 1. Feature-Based Organization
Do not add components to a global "components" folder. Instead, group them by domain in `src/features/`.
- **Bad:** `src/components/MapMarker.tsx`
- **Good:** `src/features/map/components/MapMarker.tsx`

### 2. Strategy Pattern for Webhooks
Avoid large `if/else` or `switch` blocks in main handlers. Extract event-specific logic into dedicated handler functions.
- Refer to `api/stripe-webhook.ts` for the established pattern.

### 3. Separation of Concerns
Keep "Business Logic" (calculations, DB updates) out of React components. Use hooks or utility functions in `utils/` or within the feature folder.

## 🛡️ Security Standards

### 1. Zero Hardcoded Secrets
Never commit API keys, passwords, or service account details.
- Use `import.meta.env` for frontend.
- Use `process.env` for backend.
- Maintain a local `.env` file that is listed in `.gitignore`.

### 2. Strict Input Validation
Every API endpoint must validate its input before processing.
- Verify `userId` matches the authenticated token (No ID Spoofing).
- Use regex for emails.
- Whitelist all "Tier" or "Option" inputs.

### 3. Server-Side Price Authority
Never let the client determine the price of an item or subscription. The client passes a "slug" (e.g., `shop`), and the server looks up the price in its own `TIER_CONFIG`.

## 🧪 Testing Philosophy

### 1. The "Safe Zone" Rule
No critical logic (Payments, Auth, Data Write) should be committed without an accompanying integration test in Vitest.

### 2. Smoke Testing Critical Paths
We prioritize **Integration Tests** over 100% unit test coverage.
- If it touches Stripe, test it.
- If it touches Firestore, test it.
- Run tests before every build: `npm run test`.

### 3. Mocking Policy
Always mock external APIs (Stripe, Firebase Admin) in your tests to ensure they are fast, deterministic, and don't require real credentials to run.

## 🚀 Deployment Workflow

1.  **Develop:** Write code + Integration tests.
2.  **Verify:** Run `npm run test` and `npx tsc --noEmit`.
3.  **Ship:** Push to the `main` branch (Triggering Vercel/Firebase CI/CD).
4.  **Monitor:** Check Sentry for any production regressions.
