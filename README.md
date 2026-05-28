# Range Anxiety Rider 🚲

A professional-grade platform for e-bike range calculation, fleet management, and community tools.

## 🚀 Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Vanilla CSS (Flexible & Modern)
- **Backend:** Vercel Functions (Serverless Node.js)
- **Database/Auth:** Firebase (Firestore, Auth, Admin SDK)
- **Payments:** Stripe (Checkout, Subscriptions, Webhooks)
- **Email:** Resend
- **Testing:** Vitest

## 🏗️ Project Architecture

We follow a **Feature-Based Architecture** to ensure long-term maintainability for solo-developer and small-team environments.

### Folder Structure
- `/api`: Serverless backend functions and their integration tests.
- `/src/features`: Domain-specific modules (e.g., `map`, `auth`, `social`).
- `/src/shared`: Reusable UI components and utilities.
- `/src/pages`: Top-level routing components.
- `/src/utils`: Global helper functions.

## 🛠️ Development

### Setup
1. Clone the repo.
2. Install dependencies: `npm install`.
3. Configure environment variables in `.env` (see `.env.example`).

### Commands
- `npm run dev`: Start the Vite development server.
- `npm run build`: Build for production.
- `npm run test`: Run the integration test suite.
- `npm run lint`: Run ESLint checks.

## ✅ Quality Standards

This project maintains high standards for **Security** and **Reliability**:
- **Automated Testing:** All critical paths (Payments, Auth) are protected by Vitest integration tests.
- **Security Hardening:** Strict input validation and server-side whitelisting are mandatory for all API endpoints.
- **Clean Code:** Complex logic (like Stripe Webhooks) uses the Strategy Pattern to remain readable.

---

*For detailed development guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).*
