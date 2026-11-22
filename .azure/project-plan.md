# RobinFoodMaster — Project Plan

## Approval and destination

- Approved by the user on 2026-11-05.
- Create a new, independent project at `C:\Users\HP\Documents\__workSpace\RobinFoodMaster`.
- Do not modify the existing `RobinFood` project.
- Product name: Robin Food; project/workspace name: RobinFoodMaster.

## Product goal

Build a Spanish-first, responsive food-surplus donation coordination app for iOS, Android, and web. Donors publish available food, recipients reserve and collect it, and administrators manage users, publications, support, and reports. All core flows must work with local demo data; no backend is in scope for this version.

## Reference material

- Requirements and full interaction specification: `C:\Users\HP\AppData\Roaming\Code\agentSessionData\d1b1fb08-e5c5-4ce2-a237-aa32054fe0b9\attachments\715f3793-6ca9-401f-b837-42a28d8fc83d\Pasted text #1.txt`.
- Figma Make prototype: `C:\Users\HP\Downloads\Sistema Robin Food multiplataforma.zip`.
- The mentioned 32-screen reference image was not attached. Use the written screen specifications, the ZIP's functional structure and content, and the brand tokens below; do not block implementation on the missing image.
- Do not edit the attachment or ZIP. Reuse its user-facing text, sample data, role flows, and functional ideas where practical; do not copy the prototype's generic iOS-blue styling.

## Technology and architecture

- Expo SDK stable, React Native, React Native Web, Expo Router, and strict TypeScript.
- One codebase for mobile and browser, with responsive mobile, tablet, and desktop layouts.
- Zustand stores for auth, donations, reservations, notifications, users, chat, settings, and UI.
- Zod validation and React Hook Form for user-input flows.
- Local-first persistence through AsyncStorage on native and localStorage on web, behind typed repository interfaces. Seed on first launch and provide a demo-data reset.
- No API server, hosted database, accounts service, or cloud image storage in this iteration. Document migration boundaries for a future backend.
- Use platform-specific map components where required: native maps on mobile and OpenStreetMap/Leaflet on web, without a paid map API key.
- Test with Jest, jest-expo, and React Native Testing Library.

## Users and access

Implement three roles with route and service-level authorization:

- `receptor`: discover and reserve donations, manage reservations, receive notifications, and contact support.
- `donador`: publish and manage donations, view reservations, and validate delivery codes.
- `admin`: manage users, access requests, all donations, reports, statistics, and the support inbox.

There is no public account registration. Provide sign-in, forgot-password/access-request flows, admin-created accounts, temporary passwords, forced password changes, demo account chips, and role-specific navigation. Seed the 9 accounts named in the reference: 1 administrator, 4 donors (including 1 suspended donor), and 4 recipients. Display the 3 primary demo accounts as login chips only when `EXPO_PUBLIC_DEMO_MODE=true` (default true); keep all demo credentials local and document them. Enforce a soft lock after 5 failed attempts for 5 minutes, persist sessions for up to 30 days, and require acceptance of the current Terms version. Hash demo passwords with per-user salts using Expo Crypto for this local demo; do not expose hashes or salts to UI. Include at least 14 Toluca-area donations.

## Functional scope

Implement the written 32-screen scope and the additional admin/support flows in the attachment. This includes:

- Public splash, welcome, login, access request, terms, privacy, and about.
- Role-specific mobile tabs and desktop navigation; responsive layouts at mobile, tablet, and desktop widths.
- Donation exploration, searchable/filterable maps and lists, donation detail, share, and recipient reservations.
- Four-step donor publishing with photos, category/quantity/expiry, location, draft persistence, and summary.
- Reservation details with delivery code and QR; donor code entry/scanning and delivery confirmation.
- Notifications with read state and navigation, profile/settings, FAQ/help, and locally persisted support conversations.
- Admin dashboard, statistics, publication moderation, user lifecycle, access requests, support inbox, and CSV/PDF report flows.
- Role guards, empty/loading/error/success states, accessibility labels, keyboard/focus support on web, and a complete dark mode.
- Spanish (Mexico) as the default visible language and English as the secondary language, switchable without restart.
- Include the supplied Robin Food Terms and Conditions and privacy text from the attachment in the legal screens; retain its specified version/date.

## Design direction

Use the supplied gold/cream/black Robin Food identity rather than the prototype's iOS-blue palette:

- Gold `#D9AE5F`, dark gold `#B88A3A`, cream `#FBF6EA`, white cards, ink `#111111`, muted `#6E6E73`, line `#E8E1D0`.
- Semantic status colors: success `#34C759`, warning `#FF9500`, danger `#FF3B30`.
- Inter typography, rounded cards and controls, clear touch targets (minimum 44 px), and a dark admin dashboard.
- The attachment includes a logo concept (golden robin). Use available prototype assets if present and provide a coherent local fallback when they are not.

## Domain behavior and data

Use typed models and repository operations for users, donations, reservations, notifications, chat messages, access requests, audit entries, settings, and report/stat aggregates. Seed Toluca, Metepec, San Mateo Atenco, and Zinacantepec demo content, with sample notifications, conversations, FAQ, and historical aggregates for dashboard trends.

Enforce these rules in service operations, not only in UI:

1. Donation title is 3–60 characters; quantity is positive; expiry is future; publish with 1–4 photos.
2. Recipients may hold at most 3 active reservations. A donation can have one active reservation only. Reserve atomically: update donation, create reservation and six-character unambiguous delivery code, notify both users, and audit; surface a conflict if already reserved.
3. Recipient cancellation is allowed up to one hour before expiry; restore an unexpired donation to available. Donors may cancel available or reserved donations with a reason and recipient notification.
4. Delivery requires the correct code; cap incorrect attempts at 5. On success, mark reservation and donation delivered and notify both parties.
5. Expire stale donations/reservations on app startup and every 60 seconds while active.
6. Compute distance with Haversine, defaulting to central Toluca when location permission is unavailable. Sort by recent, nearest, or soonest expiry; notify opted-in recipients within 5 km of a new donation.
7. Admin edits, removals, suspensions, and other sensitive operations require a reason where applicable and produce audit entries.
8. Label food-rescue, meal, and CO₂e calculations as estimates. Use the specified configurable conversion factors and aggregate historical stats rather than seeding thousands of rows.
9. Validate forms with Zod; never expose password hashes or salts to UI; rate-limit local login attempts and enforce authorization in services.

## Integrations and platform behavior

- Location: Expo Location on mobile and browser geolocation on web, with Toluca fallback.
- Images: pick/upload on mobile and web; validate type and 5 MB maximum, resize to 1280 px/quality 0.7 when supported, and render a local placeholder if remote sample images fail.
- Notifications: persistent in-app notifications; request native/browser notification permissions only from settings.
- Sharing, clipboard, links to maps, haptics, printing/PDF, CSV export, and optional camera QR scan should use platform APIs with graceful platform-appropriate handling.
- Maps use OpenStreetMap and require no secret keys.

## Verification and acceptance

- Strict TypeScript; run project lint, typecheck, unit tests, and `npx expo export -p web`.
- Add focused tests for login success/failure/lockout, role guards, admin user creation, publication, reservation/conflict, cancellation, delivery code success/failure, expiration, distance and impact calculations, and CSV export.
- Verify the web build and core flows use seeded local data and that no required control is a nonfunctional placeholder.
- Document setup, demo accounts, architecture, safety limitations (food-safety checks remain users' responsibility), and implementation decisions.
