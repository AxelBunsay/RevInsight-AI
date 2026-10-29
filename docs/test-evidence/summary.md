# Verification Summary

**Generated:** 2026-10-24 15:13 +08:00  
**Project:** RevInsight AI  
**Runtime:** Node.js v26.9.0; npm 11.19.1

**Integration verification update:** 2026-10-25 19:43 +08:00

**Revenue and security integration update:** 2026-10-25 19:58 +08:00

**Dependency and dead-file cleanup update:** 2026-10-25 20:12 +08:00

**Service down-payment implementation verification:** 2026-10-29

## Results

| Phase | Status | Evidence |
|---|---|---|
| 1. Legacy payment cleanup | PASS | The obsolete payment controller and route are deleted; server mounts/requires and frontend payment-intent methods are removed. Repository searches found no remaining source or dependency references to the removed integration. |
| 2. Install and static checks | PASS | Latest complete backend suite: 22 files, 158 passed, 0 failed, 0 skipped. Frontend: 17 files, 49 passed, 0 failed, 0 skipped; lint and production build pass. |
| 3. Startup check | NOT RUN | Explicitly skipped at the user's direction. No server was started and no live curl requests were made. |
| 4. Consistency checks | PASS | Inventory captured in [routes.md](./routes.md) and [models.md](./models.md). All 18 backend runtime environment names appear in `backend/.env.example`. |
| 5. Integration flows | PASS | Reservation, service, revenue, and security integration flows pass against the pinned MongoDB 7.0.14 single-node in-memory replica set; Cloudinary is mocked. No Atlas or production database was used. |
| 6. Dependency remediation and dead-file cleanup | PASS | Initial npm audits found 4 backend and 3 frontend vulnerable packages. `npm audit fix` (without `--force`) updated compatible dependency resolutions; both post-fix audits report 0 vulnerabilities. Fourteen confirmed unused frontend files were deleted. |

## Exact Commands and Outcomes

Commands were run from the indicated project subdirectory. Node and npm versions were recorded with `node --version` and `npm --version`.

| Command | Result |
|---|---|
| Search for the removed payment provider in source, configuration, and lockfiles | No matches. |
| Search for the removed payment-intent methods and API prefix | No matches. |
| Initial `npm install` from repository root | Failed with ENOENT because this repository has no root `package.json`. Re-ran from `backend`; the incidental empty root lockfile was removed. |
| `Set-Location backend; npm install` | PASS, up to date; npm reported 4 dependency audit findings (2 moderate, 2 high). |
| `Set-Location backend; npm test` (pre-integration refactor baseline) | PASS, exit code 0; 14 test files and all 67 existing tests passed. |
| `Set-Location backend; npx vitest run tests/integration/reservations.test.js tests/integration/services.test.js` | Initial run failed on invalid fixture email addresses; after correcting the fixture, one assertion was adjusted to check the persisted completion timestamp. Final focused run PASS, exit code 0; 2 files and 20 tests passed. |
| `Set-Location backend; npm test` (complete suite) | PASS, exit code 0; 16 test files and 87 tests passed, including the 20 integration cases. |
| `MONGOMS_DEBUG=1` equivalent PowerShell run with MongoDB 7.0.14, project-local download cache, `replSet.count=1`, and `launchTimeout=120000` | PASS, exit code 0. `REPLSET_START_OK`; final mongod lifecycle log: `MongoMS:MongoInstance Mongo[54729]: stop: Instance Finished Shutdown`. |
| `Set-Location frontend; npm install` | PASS, up to date; npm reported 3 high-severity dependency audit findings. It also warned that the esbuild install script is not yet covered by the allow-scripts policy; build still passed. |
| `Set-Location frontend; npm run lint` | PASS, exit code 0; no lint errors. |
| `Set-Location frontend; npm test` | PASS, exit code 0; 2 test files and 7 tests passed. |
| `Set-Location frontend; npm run build` | PASS, exit code 0; Vite built 118 modules. |
| `git diff --check` | PASS; no whitespace errors. |
| `Set-Location backend; npm test -- --run tests/integration/revenue.test.js tests/integration/security.test.js` | PASS, exit code 0; 2 files and 9 tests passed. |
| `Set-Location backend; npm test` (revenue and security integration additions) | PASS, exit code 0; 18 test files, 96 tests passed, 0 failed, 0 skipped. |
| `Set-Location backend; npm test -- tests/integration/services.test.js` (service down-payment verification) | PASS, exit code 0; 1 test file, 24 tests passed, 0 failed, 0 skipped (21.66 seconds). |
| `Set-Location backend; npm test` (service down-payment implementation) | PASS, exit code 0; 22 test files, 158 tests passed, 0 failed, 0 skipped (120.86 seconds). |
| `Set-Location frontend; npm test` (service payment breakdown and modal tests) | PASS, exit code 0; 17 test files, 49 tests passed, 0 failed, 0 skipped. |
| `Set-Location frontend; npm run lint` | PASS, exit code 0; no lint errors. |
| `Set-Location frontend; npm run build` | PASS, exit code 0; Vite 6.4.5 produced a production build. |
| `git diff --check` | PASS; no whitespace errors. |

### Service Down-Payment Changes

The setting is independently configurable from 0–100%, uses the existing item percentage as the fallback for older settings documents, and is snapshotted with each booking. Payment submission and review use the server-computed down payment; legacy bookings without the snapshot remain paid in full upfront. Service revenue remains a single full-total record at completion, with labor revenue limited to the mechanic fee.

Changed files for this implementation:

- Backend: `backend/controllers/customerServiceController.js`, `backend/controllers/reservationController.js`, `backend/controllers/serviceRequestController.js`, `backend/models/reservationSettings.js`, `backend/models/serviceRequest.js`, `backend/utils/servicePayment.js`, `backend/tests/integration/services.test.js`, `backend/tests/serviceBookingHardening.test.js`.
- Frontend: `frontend/src/admin/pages/Transactions.jsx`, `frontend/src/Customer/react/Checkout.jsx`, `frontend/src/Customer/react/Profile.jsx`, `frontend/src/Customer/react/ReservationDetail.jsx`, `frontend/src/Customer/react/ReservationPaymentForm.jsx`, `frontend/src/Customer/react/ReservationPaymentForm.test.jsx`, `frontend/src/Mechanic/MechanicJobTable.jsx`, `frontend/src/Mechanic/MechanicJobTable.test.jsx`, `frontend/src/components/ServicePaymentBreakdown.jsx`, `frontend/src/components/ServicePaymentBreakdown.test.jsx`, `frontend/src/utils/servicePayment.js`, `frontend/src/Customer/styles/customer-flow.css`.
- Evidence: `docs/test-evidence/models.md`, `docs/test-evidence/summary.md`, `docs/test-evidence/test-list.md`.

The service integration suite now holds a single stable test clock for the whole suite and derives booking dates relative to the test run, avoiding repeated clock resets during MongoDB transactions. The revenue API explicitly excludes the in-progress Manila quarter and reports `insufficientData` until five completed-quarter buckets are available.

## Dependency Audit Findings and Remediation

Initial `npm audit` results and dependency-usage review:

| Project | Package | Severity | Dependency | Used by this project |
|---|---|---|---|---|
| Backend | body-parser | High | Indirect (Express) | Yes; Express JSON and URL-encoded request-body parsing is enabled. |
| Backend | ip-address | Moderate | Indirect (express-rate-limit) | Yes; used in rate-limiter client-IP handling. |
| Backend | multer | High | Direct | Yes; memory upload middleware handles receipt and product-image uploads. |
| Backend | nodemailer | Moderate | Direct | Yes; customer registration/email flow creates a Nodemailer transporter. |
| Frontend | source-map-js | High | Indirect (PostCSS/Vite) | Used by the frontend build/development toolchain, not shipped as application runtime code. |
| Frontend | vite | High | Direct development dependency | Yes; frontend dev, test integration, and production build scripts use Vite. |
| Frontend | zod | High | Indirect (eslint-plugin-react-hooks) | Used in the lint-tool dependency chain, not application runtime code. |

`npm audit fix` completed successfully in both package projects without `--force`; no breaking major upgrades were needed. Final resolved versions include backend body-parser 2.4.0, ip-address 10.7.5, multer 2.5.0, nodemailer 10.2.1, and frontend source-map-js 1.2.2, Vite 6.4.5, and zod 4.6.7. Both final `npm audit --json` checks report zero vulnerabilities.

## Post-remediation Checks

| Command | Result |
|---|---|
| `Set-Location backend; npm audit fix` | PASS; compatible fixes applied, 0 vulnerabilities. |
| `Set-Location frontend; npm audit fix` | PASS; compatible fixes applied, 0 vulnerabilities. |
| `Set-Location backend; npm audit --json` | PASS; 0 vulnerabilities. |
| `Set-Location frontend; npm audit --json` | PASS; 0 vulnerabilities. |
| `Set-Location backend; npm test` | PASS, exit code 0; 18 files, 96 tests passed, 0 failed, 0 skipped. |
| `Set-Location frontend; npm test` | PASS, exit code 0; 2 files, 7 tests passed, 0 failed, 0 skipped. |
| `Set-Location frontend; npm run lint` | PASS, exit code 0; no lint errors. |
| `Set-Location frontend; npm run build` | PASS, exit code 0; Vite 6.4.5 built 118 modules. |
| `git diff --check` | PASS; no whitespace errors. |

The frontend build continues to emit the pre-existing warning for its 722.28 kB minified JavaScript chunk. No code behavior, UI styling, or build configuration was changed to suppress it.

## Dead-File Search and Cleanup

Project-wide frontend source searches included static imports/re-exports, dynamic import patterns, symbol references, and CSS `@import`. The following requested files had no external usage and were deleted: `frontend/src/App.css`, `frontend/src/Customer/react/Orders.jsx`, `frontend/src/Customer/react/customerData.js`, `frontend/src/Customer/styles/cart.css`, `frontend/src/Customer/styles/orders.css`, `frontend/src/Customer/styles/profile.css`, `frontend/src/admin/components/layout/AdminNavbar.jsx`, `frontend/src/admin/components/layout/SidebarItem.jsx`, `frontend/src/admin/components/layout/UserCard.jsx`, `frontend/src/admin/pages/Reservations.jsx`, `frontend/src/admin/styles/index.css`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, and `frontend/src/components/Header.jsx`.

`frontend/src/Customer/react/Reservations.jsx` remains in use by customer routes. The admin reservations route remains a redirect to Transactions; it does not import the deleted admin Reservations page. `frontend/src/admin/styles/index.css` was unused: AdminLayout imports its four stylesheet constituents directly. `frontend/src/main.jsx` and all test files were preserved as requested.

### Build Output

| Artifact | Size | Gzip |
|---|---:|---:|
| `dist/index.html` | 0.48 kB | 0.31 kB |
| `dist/assets/hero-CLDdwZDr.png` | 13.06 kB | — |
| `dist/assets/index-DW8d4B4w.css` | 145.06 kB | 25.64 kB |
| `dist/assets/index--Usk3aS2.js` | 722.28 kB | 216.59 kB |

Vite emitted its existing chunk-size warning because the minified JavaScript chunk exceeds 500 kB. The build itself succeeded.

## Phase 3 Safety and Coverage

The live server startup check was not run at the user's request. The `.env` file was not read or printed, and no production database was contacted. The isolated in-memory replica set used by the integration suite is a separate test harness; it does not verify the production server bootstrap or requested live endpoint status codes.

## Evidence Index

- [test-list.md](./test-list.md) — all test files and test names, grouped by feature.
- [routes.md](./routes.md) — API methods, paths, and required role.
- [models.md](./models.md) — Mongoose models and schema fields.
- [fixed-issues.md](./fixed-issues.md) — changes made during this verification.
- [open-issues.md](./open-issues.md) — skipped checks, warnings, and remaining suspicious items.
