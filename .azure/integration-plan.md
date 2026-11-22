# Integration hand-off — Robin Food

- Expo app at repository root; web export: `npm run build:web` to `dist`.
- Typecheck/tests/lint: `npm run typecheck`, `npm test`, `npm run lint`.
- Firebase project: `robinfood-fireb`, selected by `.firebaserc`; Firebase SDK was already present in both manifests.
- Client adapter: `src/services/foodService.ts`; local-only demo repository: `src/services/db/localDb.ts`; Firebase adapter: `src/services/firebase/backend.ts`.
- Cloud operations: `functions/index.js`; project-side bootstrap for the first admin: `functions/scripts/bootstrap-admin.mjs`.
- Firestore collections: users, donations, reservations, reservationSecrets, notifications, messages, accessRequests, auditLog, reports, and private rateLimits.
- `firestore.rules` and `storage.rules` deny unspecified access and block all client writes to domain documents. Privileged and transactional writes use authenticated callable Functions.
- The historical approved local-first plan remains context only; the current Firebase integration follows the user's later Firebase/Render request.
- No local demo account, password, donation, or historical aggregate is seeded into Firebase.
- Static Toluca route directory is informational, based on the locations supplied by the user; it is not a verified partner list or backend seed.
- Pending Console/operator work: enable Email/Password, create Firestore and Storage resources, choose billing plan, bootstrap the first admin with trusted ADC, deploy rules/indexes/Functions after explicit approval, and set Render's public web API key.
- No Firebase or Render deployment has been run. Push notifications are not implemented; in-app notifications synchronize through Firestore.
