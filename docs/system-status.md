# System Status and Completion Audit

**Audit date:** 2026-10-30
**Scope:** Repository source, tests, README, environment templates, and `docs/test-evidence/`.
**Repository state:** The worktree was already dirty when this audit began. The audit includes the checked-out files, including uncommitted frontend changes. No source, test, configuration, or database files were changed for this audit; this report is the only file created for it.
**Production access:** No production database was queried or changed. No deployment was started or manually exercised.

## Executive status

The codebase contains substantial working implementation across customer commerce, admin operations, mechanic workflows, and shared backend services. Automated backend and frontend test suites pass. This does **not** establish production readiness: no deployed/live environment was verified, some user-facing flows have limited UI-level test coverage, profile vehicles are currently browser-local state, and deployment automation/configuration is not present in the repository.

There is no standalone product requirements or objectives document in the repository. The README and the feature scope requested for this audit are used as the checklist. The percentages below are therefore a transparent scope-based estimate, not a measured code-completion or release-readiness metric.

## Method and completion calculation

1. The requested scope is divided into 10 Customer features, 9 Admin features, 3 Mechanic actions, 8 Cross-cutting features, and 4 Deployment/documentation features.
2. The supplied category weights are used: Customer 35%, Admin 35%, Mechanic 10%, Cross-cutting 15%, Deployment/documentation 5%.
3. Features within each category count equally. For implementation scoring, **Done = 100%**, **Partially done = 50%**, and **Not started = 0%**.
4. For automated-test coverage scoring, each feature is rated **Good = 100%**, **Some = 50%**, or **None = 0%** based on named tests that exercise the behavior. This is a feature-coverage estimate, **not** line or branch coverage; coverage instrumentation was not run.
5. “Verified in a running environment” means a live/deployed or fully configured app was started and exercised. Unit/integration tests are reported separately and do not count as live verification.

| Category | Weight | Features | Implementation score | Automated-test coverage score |
|---|---:|---:|---:|---:|
| Customer | 35% | 10 | 95.0% (9 Done, 1 Partial) | 65.0% (4 Good, 5 Some, 1 None) |
| Admin | 35% | 9 | 94.4% (8 Done, 1 Partial) | 72.2% (4 Good, 5 Some) |
| Mechanic | 10% | 3 | 100.0% (3 Done) | 100.0% (3 Good) |
| Cross-cutting | 15% | 8 | 81.3% (5 Done, 3 Partial) | 56.3% (1 Good, 7 Some) |
| Deployment/documentation | 5% | 4 | 62.5% (2 Done, 1 Partial, 1 Not started) | 0.0% (4 None) |
| **Weighted total** | **100%** | **34** | **93.6%** | **66.5%** |

Calculation: `Σ(category weight × category score)`. For example, implementation is `35%×95% + 35%×94.44% + 10%×100% + 15%×81.25% + 5%×62.5% = 91.62%`, rounded to **91.6%**.

### Three separate status numbers

| Measure | Result | Meaning |
|---|---:|---|
| **Implemented** | **91.6%** | Weighted completion of the listed scope using Done/Partial/Not started rules above. It is not a production-readiness score. |
| **Covered by automated tests** | **66.5%** | Weighted feature-coverage estimate using Good/Some/None; no statement/branch coverage was collected. |
| **Verified in a running environment** | **0% verified; actual deployment status unknown** | No live or deployed app was started and tested during this audit. Repository evidence explicitly records prior startup/live checks as not run. |

## Customer modules

Evidence paths are relative to the repository root. Test coverage describes relevant automated checks found in the repository and does not imply full UI-to-production coverage.

| Feature | Status | Evidence (implementation and test names) | Automated coverage | Known gaps / risks |
|---|---|---|---|---|
| Registration, email OTP, login | Done | `backend/routes/user.js`; `backend/controllers/userControllers/user.js`; `backend/models/pendingUser.js`; `frontend/src/Customer/react/CustomerAuth.jsx`. Tests: `customerAccount.test.js` — “requires a strong password and Philippine mobile number for registration”; `securityHardening.test.js` — “defaults pending OTP attempt tracking”. | Some | Tests cover validation/security cases, but no end-to-end test of sending, expiration, retry, and successful OTP verification through a real mail provider was found. Mail delivery/configuration is not live-verified. |
| Shop, filters, product variants | Done | `frontend/src/Customer/react/Shop.jsx`; `frontend/src/Customer/react/ShopProductCard.jsx`; `backend/controllers/products/productController.js`; `backend/utils/productVariants.js`. Tests: `Shop.test.jsx` — “navigates to product details and saves the shop view when the card link is activated”, “shows compact variant pricing and option count without an in-card selector”; `integration/reservations.test.js` — “returns available variant stock and filters by case-insensitive fitment”. | Good | The latest Shop UI tests cover card navigation and presentation; they do not prove all filters against live data or all browser/device combinations. |
| Product detail and option selection | Done | `frontend/src/Customer/react/ProductDetail.jsx`; product lookup/serialization in `backend/controllers/products/productController.js`. Test: `integration/reservations.test.js` — “returns available variant stock and filters by case-insensitive fitment” (API/data behavior; no dedicated product-detail component test found). | Some | Component-level tests for selection, quantity limits, all-options-out-of-stock behavior, and error states were not found. When all options are unavailable, the current detail page omits reserve actions rather than rendering them disabled. |
| Cart and checkout | Done | `frontend/src/Customer/react/CustomerPrototypeProvider.jsx`; `Cart.jsx`; `Checkout.jsx`; `backend/controllers/reservationController.js`; `backend/routes/orderingRoutes/`. Test: `serviceCart.test.js` — “summarizes item down payment and full service payment separately” (shared cart/payment behavior; no focused multi-product item-cart/checkout test found). | None | Product and service cart state is stored in browser local storage. Server-side reservation creation is authoritative for stock and price, but cart restore/checkout of multiple variants lacks direct test evidence. |
| Item reservation, down payment, GCash submission | Done | `backend/controllers/reservationController.js`; `backend/models/orderingModels/reservation.js`; `backend/utils/paymentReceipt.js`; `frontend/src/Customer/react/ReservationPaymentForm.jsx`. Tests: `integration/reservations.test.js` — “creates a reservation with computed total, down payment, and balance”, “reserves only the selected variant and uses its server price”, “moves a reservation to Payment Submitted with a reference and receipt”; `paymentReceipt.test.js` — receipt/reference validation cases. | Good | GCash receipt/reference submission is implemented, but payment confirmation is an admin/manual review workflow, not an automated GCash gateway settlement. |
| Service catalog, unit pricing, mechanic fee | Done | `frontend/src/Customer/react/Services.jsx`; `ServiceDetail.jsx`; `backend/controllers/customerServiceController.js`; `backend/models/service.js`. Tests: `integration/services.test.js` — “uses the configured service price and mechanic fee instead of client-supplied values”, “stores server-calculated one-unit and two-unit prices, fees, labels, and scaled durations”; `serviceSchema.test.js` — “validates optional unit pricing configuration”. | Good | Live service-provider and pricing configuration were not checked. |
| Service booking, time slots, down payment | Done | `backend/controllers/customerServiceController.js`; `backend/utils/serviceSlotCapacity.js`; `backend/utils/servicePayment.js`; `frontend/src/Customer/react/ServiceBookingTimeSelect.jsx`. Tests: `integration/services.test.js` — “uses scaled duration for slot availability and prevents overlapping capacity bookings”, “rejects a second booking when the selected slot is at capacity”, “rounds a 50-percent down payment and keeps the booking snapshot immutable”; `serviceBookingTime.test.js` — “groups options by time, formats remaining capacity, disables full times and omits passed times”. | Good | Unit/integration tests cover configured capacity and overlap behavior. Concurrent production load/race characteristics and deployment timezone configuration remain unverified. |
| My purchases: item and service history | Done | `frontend/src/Customer/react/MyPurchases.jsx`; `CustomerPurchaseCards.jsx`; `customerPurchases.js`; backend customer history endpoints in `backend/controllers/userControllers/user.js`. Tests: `customerPurchases.test.jsx` — “searches names, variants, service units, motorcycles, statuses, and reference fragments”, “filters by status and reference while preserving canceled and expired behavior”, “treats service bookings without saved down-payment data as fully paid”. | Some | Search/display helper behavior is tested; loading, authorization, pagination/large histories, and API error states are not comprehensively tested end to end. |
| Account, profile, vehicles, security, delete account | **Partially done** | `frontend/src/Customer/react/Profile.jsx`; `CustomerPrototypeProvider.jsx`; `backend/controllers/userControllers/user.js`; `backend/routes/customer.js`. Tests: `ProfileLayout.test.js` — alignment/layout cases; `integration/security.test.js` — “blocks account deletion when an active reservation exists”, “blocks account deletion when an accepted service booking exists”, “anonymizes historical customer records without changing their amounts or dates”. | Some | Account profile/password/delete handlers exist, but saved vehicles are held in frontend local state/local storage (`CustomerPrototypeProvider`) and no persisted vehicle API/model was found. Email is intentionally read-only; there is no email-change flow. |
| Customer notifications: bell, read, clear | Done | `frontend/src/Customer/react/CustomerLayout.jsx`; `frontend/src/components/NotificationDropdown.jsx`; `backend/controllers/notificationController.js`; `backend/routes/notifications.js`; `backend/models/notification.js`. Tests: `NotificationDropdown.test.jsx` — “calls the clear API, clears the list and unread badge count”, “keeps the existing list and surfaces an error if clearing fails”; `customerNavigation.test.jsx` — dropdown keyboard/outside-click cases. | Some | UI behavior is tested, but dedicated backend notification API integration tests were not found. |

## Admin modules

| Feature | Status | Evidence (implementation and test names) | Automated coverage | Known gaps / risks |
|---|---|---|---|---|
| Admin login and protected pages | Done | `backend/routes/adminRoutes/admin.js`; `backend/controllers/adminControllers/adminController.js`; `backend/middleware/adminAuth.js`; `frontend/src/admin/pages/Login.jsx`. Test: `securityHardening.test.js` — “returns 401 for invalid admin credentials”; `authMiddleware.test.js` role/token cases. | Some | Invalid credential/guard behavior has tests; successful deployment bootstrap and admin credential rotation were not verified. |
| Dashboard | Done | `frontend/src/admin/pages/Dashboard.jsx`; `backend/controllers/adminControllers/dashboardController.js`; `backend/routes/adminRoutes/dashboard.js`. Test: `integration/revenue.test.js` — “keeps dashboard, quarterly, sales report, and concentration totals consistent”. | Some | Dashboard metrics are covered through API consistency tests, not a live dashboard session. |
| Revenue analysis: quarterly revenue, forecast, risk, concentration | Done | `backend/utils/revenue.js`; `backend/controllers/adminControllers/dashboardController.js`; `frontend/src/admin/pages/Dashboard.jsx`. Tests: `revenue.test.js` — forecast projection, risk thresholds, concentration, missing-quarter cases; `integration/revenue.test.js` — “keeps dashboard, quarterly, sales report, and concentration totals consistent”, “ignores the in-progress quarter and reports insufficient data below five completed quarters”. | Good | Forecasts are statistical projections from historical quarters, not guaranteed predictions. Results depend on available historical data and correct source records. |
| Ask AI (Gemini) | Done | `backend/controllers/adminControllers/aiController.js`; `backend/services/aiService.js`; `backend/routes/adminRoutes/ai.js`; `frontend/src/admin/components/dashboard/`. Tests: `aiController.test.js` — “rejects questions longer than 500 characters with HTTP 400”, “returns a peso-formatted answer from the revenue AI endpoint”, “includes the dashboard forecast, official risk levels, shared thresholds, and uncategorized share in the AI payload”. | Good | Gemini availability, production keys, quotas, output quality, and external-service failure behavior were not verified against the live provider. |
| Inventory, variants, images, categories | **Partially done** | `frontend/src/admin/pages/Inventory.jsx`; `backend/controllers/adminControllers/dashboardController.js`; `backend/controllers/products/productController.js`; `backend/utils/productVariants.js`; `backend/models/product.js`. Tests: `productVariants.test.js` — label/uniqueness/attribute/stock validation and “rejects a variant price below 0.01”; `integration/reservations.test.js` — variant creation, image upload handling, inventory update and reserved-stock checks; `productImage.test.js` image validation. | Some | The variant schema, validation helper, and admin form require price ≥0.01, while the stated variant requirement allows price ≥0; zero-priced variants are therefore rejected. Focused tests for the full admin variant editor, expanded table, and every category UI path were not found. Cloudinary was mocked in tests, not live-tested. |
| Transactions: items/services, payment review, completion, cancellation/refund | Done | `frontend/src/admin/pages/Transactions.jsx`; `TransactionsPageActions.jsx`; `backend/controllers/reservationController.js`; `backend/controllers/serviceRequestController.js`; admin routes. Tests: `integration/itemTransactions.test.js` — transaction listing/filter cases; `TransactionsPageActions.test.jsx` — “exposes item and service transaction actions”; `integration/reservations.test.js` lifecycle cases; `serviceBookingHardening.test.js` — “requires an admin refund decision before cancelling a confirmed service booking”. | Good | Receipt/payment review is manual. UI and API integration are tested but no live admin operations session was performed. |
| Mechanics management and labor KPI | Done | `frontend/src/admin/pages/Mechanics.jsx`; `backend/controllers/mechanic.js`; `backend/controllers/adminControllers/dashboardController.js`; `backend/tests/mechanicsReport.test.js`. Tests: `mechanicStats.test.js` — “counts scheduled statuses and sums completed labor fees only”; `mechanicsReport.test.js` — “joins the service request collection by mechanic references and sums completed labor fees”. | Some | KPI aggregation tests exist; mechanic management UI workflows and real operational data were not comprehensively exercised. |
| Payment/reservation settings: GCash QR, down-payment %, schedule | Done | `frontend/src/admin/pages/Inventory.jsx` and settings surfaces; `backend/controllers/paymentSettingsController.js`; `backend/controllers/reservationController.js`; `backend/models/reservationSettings.js`. Tests: `integration/paymentSettings.test.js` — QR upload/replacement, public/private settings, invalid input and cleanup cases; `integration/services.test.js` — service down-payment configuration/fallback cases. | Good | External Cloudinary and live configuration persistence are not verified. |
| Admin notifications | Done | `backend/controllers/notificationController.js`; `backend/routes/adminRoutes/admin.js`; admin shared notification UI in `frontend/src/components/NotificationDropdown.jsx`. Tests: `NotificationDropdown.test.jsx` clear/error behavior; `NotificationContent.test.jsx` message/timestamp presentation. | Some | No dedicated admin notification backend integration test was found. |

## Mechanic modules

| Feature | Status | Evidence (implementation and test names) | Automated coverage | Known gaps / risks |
|---|---|---|---|---|
| Accept assigned/available jobs | Done | `frontend/src/Mechanic/MechanicJobs.jsx`; `frontend/src/Mechanic/mechanicService.js`; `backend/controllers/serviceRequestController.js`; `backend/controllers/mechanic.js`; `backend/routes/mechanicParts.js`. Test: `integration/services.test.js` — “mechanic accept, start, and complete creates one revenue record with the configured labor fee”. | Good | Integration behavior is tested against in-memory MongoDB; no live mechanic account/session was tested. |
| Start jobs | Done | Same mechanic/service request implementation above. Test: `integration/services.test.js` — “mechanic accept, start, and complete creates one revenue record with the configured labor fee”; “does not allow an unpaid booking to start or complete”. | Good | Live role assignment and field operation are not verified. |
| Complete jobs and update labor/revenue | Done | `backend/controllers/serviceRequestController.js`; `backend/models/businessRecord.js`; `frontend/src/Mechanic/MechanicJobTable.jsx`. Tests: `integration/services.test.js` — completion creates one revenue record; `MechanicJobTable.test.jsx` — “shows the outstanding balance to collect when completing a job”. | Good | Revenue behavior is integration-tested, but deployment data and external accounting reconciliation are unknown. |

## Cross-cutting modules

| Feature | Status | Evidence (implementation and test names) | Automated coverage | Known gaps / risks |
|---|---|---|---|---|
| Authentication, authorization, role checks | Done | `backend/middleware/auth.js`; `authorize.js`; `adminAuth.js`; role-specific route files. Tests: `authMiddleware.test.js` — allowed/disallowed/missing tokens; `integration/security.test.js` — “rejects every role from three routes belonging to another role”, “rejects a deleted customer using a previously issued token”. | Some | Tests cover representative cases, not every route/role pair. No independent penetration test was run. |
| Input validation and server-side pricing | Done | `backend/middleware/validate.js`; `backend/utils/inventoryValidation.js`; service and reservation controllers. Tests: `integration/reservations.test.js` — server variant price, missing variant ID, stock conflicts; `integration/services.test.js` — ignores client price and amount; `paymentReceipt.test.js` receipt constraints. | Some | Coverage is behavior-specific; there is no exhaustive fuzz/property test of all public inputs. |
| Security controls: rate limits, secrets, headers, dependency exposure | **Partially done** | `backend/app.js` (Helmet, CORS, API rate limit, production JWT-secret length check); `backend/middleware/loginRateLimit.js`; `.env.example` files; `securityHardening.test.js`. | Some | Secret rotation and actual deployment secret policy are unknown. A local `backend/.env` exists in the worktree and is not tracked by Git; its contents were not read or reported. Offline audit results can be based on cached advisory metadata. No penetration test or secret-scanning result was collected. |
| Data models, indexes, persistence invariants | Done | `backend/models/` (including `businessRecord.js`, `paymentReference.js`, `serviceSlotLock.js`, product/reservation/service/user models); `backend/tests/integration/helpers/index.js` uses an in-memory replica set. Tests: `serviceSchema.test.js`; `productVariants.test.js`; integration reservation/service/revenue suites. | Some | Mongoose schemas and index declarations are present. Actual index creation/state, migrations, backup/restore, and data integrity in a deployed database are not verified. |
| Cloudinary uploads and cleanup | Done | `backend/config/cloudinary.js`; `backend/utils/productImage.js`; `paymentReceipt.js`; `backend/utils/productVariants.js`; upload middleware. Tests: `productImage.test.js`; `paymentReceipt.test.js`; `integration/paymentSettings.test.js` replacement/cleanup cases; variant photo case in `integration/reservations.test.js`. | Some | Integration tests mock Cloudinary. Credentials, account permissions, delivery URLs, and cleanup in the actual Cloudinary account are not verified. |
| BusinessRecord/revenue integrity and double-count prevention | Done | `backend/models/businessRecord.js`; `backend/utils/revenue.js`; reservation/service completion controllers. Tests: `integration/revenue.test.js` — dashboard/quarterly/sales/concentration consistency and forfeited deposits; reservation/service integration tests check one revenue record and idempotence; `serviceBookingHardening.test.js` — no revenue before confirmed payment. | Good | Test evidence supports core invariants; no independent reconciliation against real historical business records was performed. |
| Error handling and recoverability | **Partially done** | `backend/app.js` centralized error middleware; controllers return field-specific statuses/messages; `backend/utils/safeDeleteInventoryRecord.js`; rollback/cleanup behavior in image/payment flows. Tests: payment settings cleanup cases, reservation hardening, service booking hardening. | Some | Error handling patterns differ across controllers; logs and user-safe responses are tested in selected flows only. Production observability, alerting, and failure recovery procedures were not found/verified. |
| Responsive UI and accessibility basics | **Partially done** | Customer/admin/mechanic CSS and semantic React components; `adminResponsiveLayout.test.js`; `customerPurchases.test.jsx` responsive assertions; `customerNavigation.test.jsx` keyboard/menu accessibility checks; `Shop.test.jsx` keyboard-focus/grid styling. | Some | Some responsive and keyboard behavior is tested. There is no comprehensive automated accessibility audit, screen-reader test, or cross-browser/device test report in the repository. |

## Deployment and documentation

| Feature | Status | Evidence (implementation and test names) | Automated coverage | Known gaps / risks |
|---|---|---|---|---|
| Render backend/frontend deployment configuration | **Not started / not found** | README mentions `RENDER_EXTERNAL_URL` and `FRONTEND_URL`; no Render blueprint, Dockerfile, Compose file, or other checked-in deployment manifest was found in the repository root, `.github`, `backend`, or `frontend`. | None | Render service definitions, build/start commands, health checks, static hosting/routing, and production environment settings must be confirmed or supplied. |
| Environment-variable documentation/templates | Done | `backend/.env.example`; `frontend/.env.example`; README setup instructions. | None | Templates document names, not whether real deployment values are correctly provisioned or rotated. Secret values were not printed. |
| CI and project scripts | **Partially done** | `backend/package.json` defines `test`, `start`, `dev`; `frontend/package.json` defines `test`, `lint`, `build`, `dev`, `preview`. | None | Scripts exist, but no repository CI workflow/configuration was found. Backend has no lint or build script. |
| README/setup and project evidence | Done | `README.md`; `docs/test-evidence/summary.md`, `routes.md`, `models.md`, `test-list.md`, `open-issues.md`, `fixed-issues.md`. | None | The README provides setup and service migration guidance, but no standalone acceptance/scope document or verified deployment runbook was found. Existing test-evidence counts predate this audit's latest test run. |

## Current automated validation

Commands were run from the corresponding project directories. Test and build commands used the current checkout; no production database was used.

| Check | Command | Result |
|---|---|---|
| Backend tests | `Set-Location backend; npm test` (`vitest run --no-file-parallelism`) | **PASS** — 23 test files, 173 tests passed, 0 failed, 0 skipped; 113.57 seconds. Integration fixtures use an in-memory MongoDB replica set. |
| Frontend tests | `Set-Location frontend; npm test` | **PASS** — 23 test files, 77 tests passed, 0 failed, 0 skipped; 7.68 seconds. |
| Frontend lint | `Set-Location frontend; npm run lint` | **PASS** — ESLint exit code 0; no lint errors reported. |
| Frontend production build | `Set-Location frontend; npm run build` | **PASS** — Vite built 142 modules; exit code 0. Advisory: minified JavaScript bundle is 776.14 kB, above Vite's 500 kB warning threshold. |
| Backend lint/build | No corresponding scripts in `backend/package.json` | **Not available** — no backend lint or build command was defined; backend tests were run. |
| Backend dependency audit | `Set-Location backend; npm audit --offline --json` | **PASS (offline metadata)** — 0 reported vulnerabilities (0 critical/high/moderate/low); 271 dependency entries in audit metadata. Offline cache means this is not a live advisory refresh. |
| Frontend dependency audit | `Set-Location frontend; npm audit --offline --json` | **PASS (offline metadata)** — 0 reported vulnerabilities (0 critical/high/moderate/low); 232 dependency entries in audit metadata. Offline cache means this is not a live advisory refresh. |
| Live startup/deployed checks | Not run | **Unknown / not verified.** Existing `docs/test-evidence/open-issues.md` also records the earlier live startup and HTTP checks as not run. |

There were no test, lint, or build failures in the successful commands above. Initial test/lint/build invocations from the repository root returned `ENOENT` because the repository has no root `package.json`; the commands were rerun from `backend`/`frontend` and passed. This was an invocation-location issue, not a test failure.

## Known limitations and unresolved risks

1. **GCash verification is manual.** Customers submit a payment reference and receipt; an administrator reviews/accepts or rejects it. No GCash API settlement or automatic payment confirmation is evidenced.
2. **Saved vehicles are browser-local.** `CustomerPrototypeProvider.jsx` reads/writes vehicles in `localStorage`; no server-backed vehicle persistence endpoint/model was found. This is the main feature-level implementation gap counted in Customer.
3. **Email is not changeable in Account.** The customer email field is read-only and the UI explicitly identifies it as the login email.
4. **Revenue forecast is a statistical projection.** `backend/utils/revenue.js` derives a forecast from historical completed quarters and requires sufficient history; it is not a guarantee of future revenue.
5. **Slot capacity/overlap logic has integration coverage**, including scaled durations and rejection at capacity. Production concurrency/load behavior is not verified; the earlier example of overlapping jobs ignoring capacity is not supported by the current integration test evidence.
6. **No live environment verification.** Startup against deployment configuration, external email/Cloudinary/Gemini calls, production route status, actual MongoDB indexes, and end-to-end customer/admin/mechanic sessions are unknown.
7. **No CI or checked-in Render deployment configuration was found.** A passing local build/test run does not prove deployment automation or hosting configuration.
8. **Build size advisory:** the current frontend JavaScript bundle is 776.14 kB minified, above Vite's 500 kB advisory threshold.
9. **Test data:** backend integration tests use an in-memory replica set according to the test helper and existing evidence. No production database was inspected, so any test/demo data in a separately configured environment is unknown.
10. **Secret rotation and deployment secret hygiene are unknown.** Environment templates exist; local secret values were intentionally not read. Confirm that real secrets are managed outside Git, restricted, and rotated as appropriate.
11. **Offline npm audit is not a current registry scan.** It reported zero findings from locally available metadata; rerun online in a controlled environment for current advisory status.
12. **Accessibility evidence is partial.** Selected keyboard/focus and responsive tests exist, but there is no comprehensive WCAG audit or assistive-technology validation.

## Prioritized TODO to reach fully evidenced completion

Size estimates: **S** = small, **M** = medium, **L** = large. Ordering prioritizes user/data/security risk and deployment readiness.

| Priority | Remaining work | Size | Completion evidence to require |
|---:|---|:---:|---|
| 1 | Persist customer vehicles through authenticated backend APIs; add validation, ownership tests, and account UI loading/error cases. | M | Integration tests prove create/list/update/delete and authorization; frontend tests cover saved vehicles after reload/login. |
| 2 | Define and add deployment configuration/runbooks for the intended Render frontend/backend topology, including build/start/health checks and environment variables without secrets. | M | Configuration review plus successful staging deployment and documented health/API checks. |
| 3 | Run full end-to-end flows in a non-production staging environment: registration/OTP, browse/variant/cart/reservation/payment review, service booking/payment/mechanic lifecycle, admin transactions, profile/delete. | L | Reproducible browser/API test report with environment and test data details. |
| 4 | Add a CI workflow that runs backend tests, frontend tests, frontend lint/build, and a dependency audit on pull requests. Add backend lint if a backend lint policy/tool is selected. | M | Green CI run on the default branch and documented supported commands. |
| 5 | Expand frontend integration tests for product detail/cart/checkout (multiple products and variants), OTP success/expiry/resend, admin inventory variants, admin notification APIs, and representative empty/error/loading states. | L | Named tests cover the end-to-end user flows and regression cases; feature coverage estimate updated. |
| 6 | Review secret lifecycle and deployment configuration: verify no secrets are committed, rotate applicable credentials, document ownership/rotation, and perform a current online dependency audit. | M | Secret scan and security checklist results; current advisory audit output; no values recorded in docs. |
| 7 | Validate database indexes/migrations and backup/restore procedure in staging, including service slot locks, payment-reference uniqueness, and BusinessRecord uniqueness. | M | Staging index inspection, migration rehearsal, and restore test evidence. |
| 8 | Perform accessibility and responsive verification across key customer/admin/mechanic flows, including keyboard-only and screen-reader checks; address the large frontend bundle advisory if performance targets require it. | M | Accessibility report and viewport/browser matrix; build-size budget or documented exception. |
| 9 | Add operational monitoring/alerting and recovery guidance for email, Cloudinary, Gemini, payment receipt cleanup, and database transaction failures. | M | Runbook plus tested alerts/failure-recovery exercises in staging. |
| 10 | Reconcile existing/demo/test records in each non-production/deployment environment without querying production during this audit. | S–M | Environment owner confirms dataset provenance and cleanup/retention policy. |

## Evidence sources reviewed

- `README.md`
- `docs/test-evidence/summary.md`
- `docs/test-evidence/test-list.md`
- `docs/test-evidence/routes.md`
- `docs/test-evidence/models.md`
- `docs/test-evidence/open-issues.md`
- `docs/test-evidence/fixed-issues.md`
- Backend models, routes, controllers, middleware, services, utilities, and tests under `backend/`
- Customer, admin, mechanic, shared component, and utility source/tests under `frontend/src/`
- `backend/.env.example`, `frontend/.env.example`, and package manifests (secret values were not read)

## Objective coverage and missing parts

This section is a source-level gap analysis against the Chapter 1 objectives and delimitations supplied by the project owner. It supplements the earlier implementation status; it does not claim that the application was deployed or manually exercised. No production database was accessed. Test names below identify repository test files and behaviors; this analysis did not rerun the suites.

### Assessment method and evidence limits

- Objective coverage is qualitative: **Met** means the required behavior is represented in code and there is relevant test evidence; **Partially met** means a material detail differs from the stated objective or lacks enough evidence; **Not met** means no implementation was found.
- Evidence links are repository-relative paths. Integration tests exercise an in-memory MongoDB replica set; they do not prove live deployment, production configuration, usability, or real-provider availability.
- Earlier sections contain test counts from earlier runs. They are historical evidence, not a fresh run for this addendum. The latest frontend run recorded in this session was 27 files / 92 tests, with lint and build passing; the existing backend evidence records 23 files / 173 tests. The analysis itself did not rerun tests.
- No evaluation protocol, participant results, load/performance measurements, accuracy benchmark, or usefulness study was found. Functionality tests alone do not satisfy the General Objective’s evaluation criteria.

### Objective-by-objective coverage

| Objective | Status | Evidence and automated tests | Missing or different |
|---|---|---|---|
| General objective: design, develop, and evaluate an AI-driven revenue concentration analysis and service booking system; evaluate functionality, usability, performance, accuracy, usefulness | **Partially met** | Revenue analysis and service booking source is present in `backend/utils/revenue.js`, `backend/controllers/adminControllers/dashboardController.js`, `backend/services/aiService.js`, `backend/controllers/customerServiceController.js`, and `backend/controllers/serviceRequestController.js`. `backend/tests/integration/revenue.test.js` and `backend/tests/integration/services.test.js` cover key logic. | The provider is Gemini rather than Anthropic; tests are not a usability, performance, predictive-accuracy, or owner-usefulness evaluation. No live evaluation evidence was found. |
| 1.1 Record product orders (cart, checkout, online payment) and completed labor services as revenue transactions | **Partially met** | Product cart/order and reservation flows are under `backend/routes/orderingRoutes/`, `backend/routes/reservations.js`, and `backend/controllers/reservationController.js`; service completion and revenue synchronization are in `backend/controllers/serviceRequestController.js`. `backend/tests/integration/reservations.test.js` covers reservation/revenue behavior; `backend/tests/integration/services.test.js` covers service payment/completion. | Checkout is not an online card payment integration. It is a GCash QR instruction, customer-entered reference, uploaded proof, and manual admin review. No card processor or card-payment code was found. |
| 1.2 Store and organize catalog, inventory, user, mechanic, transaction, and booking records in a centralized database | **Met** | Mongoose models include `backend/models/product.js`, `backend/models/user.js`, `backend/models/mechanic.js`, `backend/models/businessRecord.js`, reservation and service-request models. `backend/tests/integration/` exercises these persistence flows. | Live MongoDB configuration and operational backup/recovery were not verified. Vehicle records are an exception: the customer’s saved vehicles are browser-local, not a server-side user-owned collection. |
| 1.3 Secure role-based access for admin, mechanic, and customer | **Met** | `backend/middleware/auth.js`, `backend/middleware/authorize.js`, `backend/middleware/adminAuth.js`, and route-level `authorizeRoles(...)` checks protect customer, mechanic, and admin APIs. `backend/tests/integration/security.test.js` covers representative role and account-state cases. | This is a source/test conclusion for representative routes, not a formal exhaustive endpoint-by-endpoint authorization proof. |
| 2.1 Identify products, accessories, and labor services contributing the highest revenue | **Met** | Revenue aggregation and categorized contributors are implemented in `backend/utils/revenue.js` and `backend/controllers/adminControllers/dashboardController.js`; the Dashboard UI is in `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`. `backend/tests/integration/revenue.test.js` checks revenue/contributor consistency. | The result depends on records already synchronized as completed revenue; this is not a forecast or a causal analysis. |
| 2.2 Show percentage share and top-one, top-three, HHI indicators; classify Low / Moderate / High | **Partially met** | Backend concentration response calculates top-one share, top-three share, HHI, and a concentration level in `backend/controllers/adminControllers/dashboardController.js`; risk thresholds and labels are in `shared/revenueRiskConfig.json`. The Dashboard currently renders HHI and top-contributor share in `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`. | `topThreeShare` is computed in the API but was not found in the Dashboard UI. Current classification is **Normal / Moderate / High**, not **Low / Moderate / High**. The minimum-data case may return an insufficient-data/limited-data status rather than a three-level classification. |
| 2.3 Anthropic API-assisted summaries of computed contributors, concentration patterns, and risks for owner review | **Partially met** | The AI endpoint/controller is `backend/controllers/adminControllers/aiController.js`; provider/model/prompt behavior is in `backend/services/aiService.js`; the interface is in `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`. | The implementation calls Google Gemini, not Anthropic. The provider mismatch is material to the stated objective. The summaries are advisory and depend on provider availability; no evidence establishes factual accuracy or owner usefulness. |
| 3.1 Browse services and submit booking requests | **Met** | Public service catalog and slot endpoints are wired in `backend/routes/customerServices.js`; creation is handled by `backend/controllers/customerServiceController.js`; customer screens are under `frontend/src/Customer/react/`. `backend/tests/integration/services.test.js` covers booking, unit pricing, payment, and schedule behavior. | Slot availability is application-derived; it is not an external calendar integration and does not establish conflict-free scheduling across all real-world work. |
| 3.2 Mechanic assignment, job acceptance, start-time scheduling, and status updates by administrators/mechanics | **Partially met** | Admin assignment and status routes are in `backend/routes/serviceRequest.js` and `backend/controllers/serviceRequestController.js`; mechanic UI/actions are under `frontend/src/Mechanic/`. The service integration tests cover mechanic assignment/accept/start/complete behavior. | Admin can assign a mechanic but the assignment action itself does not set a start time. Customer booking input and the mechanic accept action can carry schedule/start-time information. The code supports mechanic acceptance, start, and completion; the split between customer-selected schedule, admin assignment, and mechanic-supplied start time should be made explicit in the thesis. |
| 3.3 Display booking status updates to customers through their accounts | **Partially met** | Customer-owned requests are returned by `GET /api/service-requests/my` through `getUserServiceRequests` in `backend/controllers/serviceRequestController.js`; current status is shown in My Purchases and booking detail under `frontend/src/Customer/react/`. Status transitions generate customer in-app notifications. | The persisted `statusHistory` is returned, but the live booking detail renders the current status rather than a full per-transition timeline. The prototype/local booking timeline is not equivalent to a verified live status-history display. No SMS/email booking updates are sent (also excluded by the supplied delimitations). |

### Specific questions

#### a. Ask AI provider and what switching to Anthropic requires

Ask AI currently uses **Google Gemini** through `@google/generative-ai`, not Anthropic:

- Provider client, prompts, model selection, and response/error handling: `backend/services/aiService.js`.
- Revenue context and request construction: `backend/controllers/adminControllers/aiController.js`.
- Dashboard UI/API call: `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx` and the admin API service.
- Documented server environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL` in `backend/.env.example`.
- The dependency is declared in `backend/package.json`.

To switch, replace the Gemini client invocation with Anthropic Messages API client/request handling; add an `ANTHROPIC_API_KEY` and model setting to the example/environment documentation (without committing a real value); map the existing system/user prompt and response shape to Anthropic’s API/version headers; preserve server-side-only secret handling and current aggregate-only payload; update provider error/fallback behavior; and add mocked provider tests for success, malformed response, timeout, and API error. Do not send customer-identifying fields to the model.

#### b. Payment implementation versus online card payment

The customer sees GCash payment instructions/QR, submits a reference number and receipt image, and waits for an administrator to confirm or reject it. Relevant code includes `backend/utils/paymentReceipt.js`, `backend/controllers/reservationController.js`, `backend/controllers/serviceRequestController.js`, `frontend/src/Customer/react/ReservationPaymentForm.jsx`, `frontend/src/Customer/react/Checkout.jsx`, and admin payment-review screens. Receipt images are uploaded through Cloudinary-backed middleware. This is manual proof review, not a card payment gateway. No card number/tokenization, acquiring-bank, or card processor integration was found. A payment reference is not proof of automated settlement.

#### c. Concentration indicators and labels

- **Computed in backend response:** top-one share, top-three share, HHI, contributors, and classification in `backend/controllers/adminControllers/dashboardController.js`; calculation support is in `backend/utils/revenue.js`.
- **Shown in current Dashboard:** HHI and top-contributor share are rendered by `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`. No rendering of `topThreeShare` was found in that component.
- **Classification:** code/UI use **Normal / Moderate / High**, not **Low / Moderate / High**. Labels and numeric thresholds are defined in `shared/revenueRiskConfig.json`; Dashboard explanatory wording is in `AIRevenueAnalysis.jsx`.
- **Test evidence:** `backend/tests/integration/revenue.test.js` verifies API/revenue behavior, but a specific frontend assertion that top-three share appears to an administrator was not found.

#### d. Forecast and export features that differ from the delimitations

| Feature | Evidence | Conflict and smallest removal/hide approach |
|---|---|---|
| Quarterly projection/estimate card and chart | `backend/controllers/adminControllers/dashboardController.js` `getProjectedRevenue`; mounted under `GET /api/dashboard/analytics/projected-revenue` in `backend/routes/adminRoutes/dashboard.js`; rendered in `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`; forecast calculation in `backend/utils/revenue.js`. | Forecasting is explicitly excluded. Minimal UI-only change: stop requesting/rendering the projection and remove its estimate card/chart. To remove the capability rather than just hide it, also remove the route/controller calculation after confirming there are no other clients. |
| Forecast-related risk indicator | `getRevenueRisk` in `dashboardController.js` incorporates quarterly forecast data; risk thresholds are in `shared/revenueRiskConfig.json`; displayed in Dashboard risk/indicator UI. | Remove forecast-derived risk indicators and associated UI/thresholds if the delimiter is binding. Retain actual historical concentration/risk calculations. |
| Forecast content in Ask AI context | `backend/controllers/adminControllers/aiController.js` supplies forecast/risk context to `backend/services/aiService.js`; `AIRevenueAnalysis.jsx` displays generated analysis. | Remove forecast values and forecast-directed prompt claims from the AI payload/prompt; preserve historical contributor and concentration context. |
| Dashboard “Export report” / print report | `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx` opens a report view and uses browser printing, including Save as PDF behavior. The underlying data comes from dashboard/business-record APIs. | PDF/report export is excluded. Minimal UI change: remove the export action and print-only report UI/styles. Do not confuse a print dialog with an automated server PDF endpoint. |
| Transactions CSV export | Transactions UI under `frontend/src/admin/pages/Transactions.jsx` builds/downloads CSV from business-record data; records are served by `GET /api/dashboard/business-records` in `backend/controllers/adminControllers/dashboardController.js` and dashboard routes. | CSV export is excluded. Remove the CSV download control and its frontend formatter/download function; the API may remain for on-screen transaction listing. |
| Other report-shaped JSON endpoints | Dashboard routes/controllers also expose sales, inventory, mechanic, risk, and analytics data as JSON. | No separate PDF/CSV download endpoint was found for these JSON APIs. Do not remove operational dashboard endpoints merely because their response is report-like; remove only if the corresponding analytics are outside the approved scope. |

#### e. Mechanic assignment, scheduling, actions, and customer visibility

- **Admin assignment:** yes. `PUT /api/service-requests/assign` is admin-only and handled by `assignMechanic` in `backend/controllers/serviceRequestController.js`; the screen is `frontend/src/admin/pages/ServiceRequests.jsx`.
- **Admin setting a start time during assignment:** no, not through the assignment operation. The service model has `startTime`; booking data can carry scheduling fields, and mechanic acceptance at `PUT /api/service-requests/accept` can set a start time. The UI/API roles should not be described as admin-scheduled unless a separate admin control is added.
- **Mechanic actions:** yes. Mechanic-authorized routes and `performJobAction` support accepting, starting, and completing a job. Completion synchronizes a service `BusinessRecord`.
- **Customer view:** the account displays current booking status and receives in-app status notifications; customer reads are scoped to that user. Although `statusHistory` exists and is returned by the customer payload, the live booking detail does not render a complete event-by-event status timeline. This is partial visibility, not proof that every historical status change is displayed.
- **Evidence/tests:** `backend/routes/serviceRequest.js`, `backend/controllers/serviceRequestController.js`, `frontend/src/Mechanic/mechanicService.js`, `frontend/src/Customer/react/ReservationDetail.jsx`, and `backend/tests/integration/services.test.js`.

#### f. Notification channels and OTP

- **Customer and admin booking/payment notifications:** in-app records stored by `backend/models/notification.js`, read through `backend/controllers/notificationController.js` and `/api/notifications` routes. Service transitions can create customer notifications; payment submission creates admin notifications.
- **Mechanic notifications:** the mechanic client currently returns an empty list in `frontend/src/Mechanic/mechanicService.js`; no working mechanic notification channel was found.
- **Email:** registration OTP is sent through the configured email service; it is for account verification/authentication, not booking updates. See registration/OTP code in `backend/controllers/userControllers/user.js` and `backend/.env.example`.
- **SMS:** no SMS sending integration was found. Phone number/preferred-contact fields do not establish an SMS service.
- **Booking updates by email/SMS:** none found, consistent with the stated exclusion of SMS/email booking notifications.

#### g. Personal data, access, API returns, AI, and exports

| Data | Storage/return and access evidence |
|---|---|
| Customer identity | MongoDB `User` records store first/last name, email, phone number, password hash, account/OTP state, profile image, preferences, and purchase statistics (`backend/models/user.js`). Password is `select: false`. Login/profile endpoints return identity/profile fields to the authenticated user. |
| Vehicle information | Saved vehicles are in `CustomerPrototypeProvider.jsx` browser `localStorage`; no server-side vehicle schema or customer vehicle API was found. Service bookings separately store vehicle text in booking records. |
| Item/service transaction identity | Reservations and service requests store customer IDs and, depending on flow, customer name/phone, booking details, status history, payment reference, and receipt public IDs. `BusinessRecord` stores a customer display name/phone for admin reporting. |
| Receipts | Receipt images are Cloudinary-backed. Admin-only reservation/service receipt endpoints provide review access. Customer reservation/service payload serializers avoid returning receipt public IDs/submission internals; customer `GET /api/users/receipts` returns a timestamp rather than a receipt archive. |
| Customer API access | Profile and purchase/booking reads use the authenticated user ID. `GET /api/reservations` and `GET /api/service-requests/my` are customer-scoped; notification queries are audience/customer-scoped. `security.test.js` and `notifications.test.js` cover representative isolation cases. |
| Admin access | Admin authentication protects transaction, customer-related payment review, receipt review, analytics, and service-management endpoints. Admin reports include customer display names; reservation business-record rows may include customer phone. |
| Mechanic access | Mechanic routes are role-protected and job reads/actions are scoped to assigned mechanic in service-request controller logic. Job data includes customer/service/vehicle context needed to perform work; review all serialized fields before any broader mechanic-facing API change. |
| AI payload | Revenue AI context is assembled from aggregate revenue, contributors, concentration, and forecast data in `aiController.js`; customer name, email, phone, receipt, and vehicle fields were not found in that constructed payload. |
| Exports | The transaction CSV/report outputs can include customer names; the transaction record API includes customer phone for some reservation rows. The export path does not appear to include customer email or receipt images. Do not claim exports are anonymous. |

Privacy measures present include authenticated role-scoped reads, hashed passwords, and account deletion/anonymization logic in `backend/controllers/userControllers/user.js`. Risks remain: vehicles are browser-local; admin exports expose customer-identifying names/phone; retention/backup policy and deployed access controls were not verified; and a historical Git-path check found `backend/.env` in two commits. The `.env` blobs were deliberately not read, so whether those commits contained live credentials is **unknown**. Treat any credentials that were present as potentially exposed: verify with a secret scanner without printing values, rotate affected credentials, and follow the repository’s approved history-removal process if needed.

### Missing-parts review beyond the objectives

“Present” means source evidence exists; it is not a claim of live verification. “Weak” means the behavior exists but is incomplete, lacks exhaustive evidence, or has a material limitation.

| Item | Status | Evidence and gap |
|---|---|---|
| Stock cannot go negative; concurrent last-unit race | **Weak** | Reservation confirmation rechecks availability and updates inventory in a transaction; `backend/tests/integration/reservations.test.js` tests stock limits. No simultaneous last-unit concurrency test was found, so race behavior under competing confirmations is not established by the available test evidence. |
| Double-submit protection for reserve/payment | **Weak** | UI saving states and payment-state/reference checks exist in customer/admin flows and controllers. Reservation creation has no idempotency key; two distinct create requests can create separate pending reservations. No dedicated concurrent double-submit test was found. |
| Expiry worker releases stock | **Present** | Reservation expiry logic is in `backend/controllers/reservationController.js`; `backend/server.js` schedules expiry checks; reservation integration tests cover expiry/released stock. Worker operation in a deployed process was not verified. |
| Revenue counted once | **Present** | `BusinessRecord` uses a unique source/type/category key and completion uses idempotent upsert/synchronization; reservation/service integration tests cover no duplicate revenue behavior. |
| Role checks on every admin/mechanic endpoint | **Weak** | Route files apply admin/mechanic/customer middleware, with representative role tests in `security.test.js`. No generated exhaustive route-to-role matrix or automated test asserting every mounted route is protected was found. |
| Customers cannot read other customers’ reservations, receipts, or notifications | **Present** | Customer reads filter by authenticated user; receipt details are admin-only; notification queries are customer-scoped. `reservations.test.js`, `security.test.js`, and `notifications.test.js` cover representative isolation. Add a direct service-booking/receipt cross-user negative test for completeness. |
| Upload limits | **Present** | Multer/payment upload middleware applies size/type limits; customer-facing receipt errors specify 2 MB. Product/payment settings use separate upload middleware. Test coverage for every MIME/size boundary was not established here. |
| Rate limiting on login/OTP | **Weak** | Admin login uses `loginRateLimit`; API-wide rate limiting is configured in `backend/app.js`; OTP expiry/attempt count/resend timing are represented in `PendingUser` and user controller. No dedicated per-IP/per-account limiter for customer login, OTP request, and resend was found. |
| Password hashing | **Present** | User/mechanic/admin authentication code uses bcrypt hashing/comparison; password fields are excluded from normal user model selection. Security tests cover authentication cases, not the strength/configuration of every credential lifecycle path. |
| JWT expiry | **Present** | Login token creation sets an expiry; middleware verifies signed HS256 tokens with `JWT_SECRET`. Exact production token lifecycle/revocation was not live-verified; immediate revocation is not demonstrated for ordinary account changes. |
| Secrets only in environment and absent from Git history | **Weak / urgent verification** | Runtime settings use `process.env` and `.env.example` templates. A filename-only `git log` check found historical `backend/.env` paths in commits `1a3a90d` and `e0148b8`; contents were not opened. Whether secrets were committed is unknown. A local secret scan and rotation decision are required. |
| Server-side validation | **Present, with gaps** | `backend/middleware/validate.js` and model/controller validators validate many inputs; variant price rejects zero despite the required nonnegative rule. Field-specific coverage is uneven and should be tested at request boundaries. |
| Empty/loading/error states | **Weak** | Customer/admin pages contain loading, empty, and error states in multiple flows; no complete state inventory or systematic component-level coverage was found. Provider outages can still surface as generic errors. |
| Cloudinary/AI/OTP/MongoDB outage behavior | **Weak** | Upload/provider failures are caught and returned/cleaned up in several paths; AI has fallback/error handling. No systematic outage/fault-injection suite was found. OTP mail failure can leave an unverified pending registration until expiry/retry; database-down startup/health readiness behavior is not verified. |
| Data stored only in browser that should be server-side | **Weak** | `CustomerPrototypeProvider.jsx` stores saved vehicles and portions of customer prototype/cart state in `localStorage`; the User schema has no saved-vehicles field or vehicle CRUD API. Vehicle association is therefore device/browser-specific. |
| Keyboard, labels, contrast, mobile layout | **Weak** | Native controls, labels, focus handling, responsive CSS, and selected accessibility tests exist. No full keyboard-only, screen-reader, color-contrast, or cross-device accessibility audit was found. |
| `.env.example`, deployment steps, health endpoint, admin seed | **Weak** | `backend/.env.example`, `frontend/.env.example`, and README setup documentation exist. No checked-in Render manifest or CI workflow was found in the reviewed tree. No dedicated health/readiness endpoint was found. `backend/server.js` provisions an admin from environment configuration; document this process and protect bootstrap credentials. |

### Prioritized work to reach the stated objectives

Sizes: **S** small, **M** medium, **L** large. Items marked conditional depend on whether the supplied objective/delimitations remain binding after thesis review.

#### Must fix before defense

| Priority | Work | Size | Likely files/areas |
|---|---|---:|---|
| 1 | Resolve the payment requirement mismatch: implement a compliant card gateway if online card payment remains required, or obtain approval and explicitly document manual GCash proof review as a scope deviation. Do not describe GCash reference submission as card payment. | L if implementing; S to document approved deviation | `backend/controllers/reservationController.js`, `backend/controllers/serviceRequestController.js`, `frontend/src/Customer/react/ReservationPaymentForm.jsx`, `frontend/src/Customer/react/Checkout.jsx`, README/thesis documents |
| 2 | Resolve the Anthropic/Gemini mismatch: switch and test the Anthropic Messages API if the named provider remains required, otherwise record an approved provider deviation. | M | `backend/services/aiService.js`, `backend/controllers/adminControllers/aiController.js`, `backend/.env.example`, backend tests |
| 3 | Verify historical `.env` commits without exposing contents; rotate every credential found in history and record the disposition. If secrets are present, perform repository-history cleanup through the approved team process. | M | Git history/security operations; `.gitignore`, `.env.example` only if needed |
| 4 | Align concentration display with the objective: display top-three share and decide whether the classification must say Low rather than Normal; add UI tests for all three indicators/labels. | S–M | `frontend/src/admin/components/dashboard/AIRevenueAnalysis.jsx`, `shared/revenueRiskConfig.json`, frontend tests |
| 5 | Add targeted tests for concurrent final-stock confirmation and repeated reservation/payment submissions; add idempotency or a server-side duplicate-request guard if the tests expose duplicate records. | M | `backend/controllers/reservationController.js`, reservation integration tests |
| 6 | Make customer service booking status history visible in the account, or narrow thesis claims to current-status visibility; add a customer UI test for transitions/history. | S–M | `frontend/src/Customer/react/ReservationDetail.jsx`, My Purchases components/tests |

#### Should fix

| Work | Size | Likely files/areas |
|---|---:|---|
| Move saved vehicles from `localStorage` to authenticated server-side user-owned CRUD storage, with a safe migration/opt-in for existing browser data. | M | `backend/models/user.js` or a vehicle model; customer/user routes/controllers; `CustomerPrototypeProvider.jsx`, `Profile.jsx`; tests |
| Add a dedicated, measured per-IP/per-account throttle for customer login and OTP request/resend, in addition to OTP attempt/expiry rules. | M | `backend/middleware/loginRateLimit.js`, user routes/controllers, security tests |
| Add automated accessibility checks/manual checklist evidence for keyboard navigation, focus, contrast, and mobile breakpoints. | M | Frontend tests and accessibility documentation |
| Add an exhaustive route-role test or route inventory and direct cross-customer tests for service booking and receipt access. | M | `backend/routes/**`, `backend/tests/integration/security.test.js` |
| Add a health/readiness endpoint and explicit behavior/tests for database, Cloudinary, email, and AI outages. | M | `backend/app.js`/routes, provider services, tests |

#### Nice to have

| Work | Size | Likely files/areas |
|---|---:|---|
| Add provider adapter/mocked contract tests to make AI provider changes and outages testable without external calls. | M | `backend/services/aiService.js`, backend tests |
| Add a complete status-history timeline for item and service records, with accessible labels and timestamps. | M | Customer detail screens/components/tests |
| Add accessibility and responsive regression coverage at representative viewport widths, beyond source-level CSS checks. | M | Frontend test tooling and tests |
| Add retention/backup documentation and a tested restore procedure, while respecting the stated exclusion of automated backups. | M | README/operations documentation |

#### Document as limitation or approved deviation

| Limitation/deviation | Size | Evidence/doc location |
|---|---:|---|
| Manual GCash QR/reference/receipt verification instead of online card settlement, unless a gateway is implemented. | S | README and thesis payment-method/scope discussion |
| Gemini provider instead of Anthropic, unless the provider is switched. | S | README/thesis AI implementation and limitation discussion |
| Forecasting and forecast-based risk despite forecast exclusion. Remove it or explicitly secure a scope amendment. | S to document; M to remove fully | `AIRevenueAnalysis.jsx`, dashboard routes/controller, `revenue.js`, thesis scope |
| Dashboard print/Save-as-PDF and Transactions CSV export despite report-export exclusion. Remove them or approve/document the deviation. | S | `AIRevenueAnalysis.jsx`, `Transactions.jsx`, thesis scope |
| Admin assignment and mechanic/customer-supplied start-time responsibilities are split; no automated overlapping-job conflict detection. | S | README/thesis scheduling limitation |
| Customer booking detail shows current status, not a complete live event history. | S | README/thesis status-monitoring limitation |
| No SMS/email booking notifications; mechanic notification API is a placeholder. | S | README/thesis notification limitation |
| No measured usability, performance, accuracy, or usefulness evaluation. | M | Evaluation protocol, results chapter, test evidence |

### Deviations from Chapter 1

1. **Payment:** manual GCash QR/reference/receipt verification is implemented instead of the stated online card payment.
2. **AI provider:** Gemini is used instead of the specified Anthropic API.
3. **Concentration labels/UI:** backend computes top-three share, but Dashboard omits it; risk terminology is Normal/Moderate/High instead of Low/Moderate/High.
4. **Forecasting:** quarterly projections and forecast-based risk are implemented although forecasting is excluded.
5. **Exports:** Dashboard print/PDF and transaction CSV capabilities exist despite the explicit no-PDF/CSV export delimiter.
6. **Vehicle persistence:** saved vehicles are browser-local rather than centralized server-side records.
7. **Scheduling/status visibility:** admin assignment, mechanic start-time handling, and customer visibility are split; customer-facing live detail does not show the full status history. Automated conflict detection remains excluded.
8. **Evaluation:** automated functional tests exist, but no evidence was found for the required evaluation of usability, performance, accuracy, and usefulness.
9. **Credential history:** historical commits include the `backend/.env` path; whether secrets were present is unknown and requires a safe secret scan/rotation review.

### Additional features beyond the stated scope

- Quarterly revenue forecasting/projection and forecast-derived risk context.
- Dashboard print/report flow and Transactions CSV download.
- Product variants (fitment/size/color) and per-variant inventory/images.
- GCash QR upload/configuration, manual receipt review, down-payment settings, reservation-expiry handling, and refund-decision workflow. Some payment mechanics extend the stated high-level payment scope but do not satisfy card processing.
- In-app customer/admin notifications and notification clearing.
- Customer account/profile/security/delete-account and vehicle UI; vehicles are currently only local browser data.
- Data-driven AI business summaries; the implemented provider is Gemini.

### Previously reported three gaps: smallest correct fixes and defense priority

| Gap | Smallest correct fix | Worth doing before defense? |
|---|---|---|
| Customer vehicles are browser-only | Add authenticated customer-owned vehicle CRUD (either a bounded `savedVehicles` subdocument on `User` or a `Vehicle` model with `customerId`), validate fields server-side, scope every read/write to the authenticated user, switch the profile UI/provider to the API, and offer an explicit one-time import of existing local data. Add ownership and persistence tests. | **Yes**, because the stated architecture calls for centralized customer/vehicle-related records and browser-local data is device-specific. |
| Variant validation rejects zero price | Change variant validation consistently from a `0.01` lower bound to `0` in `backend/utils/productVariants.js`, the product variant schema validators, and the admin form/variant validation in `frontend/src/admin/pages/Inventory.jsx`; add API/model/UI tests for zero and negative values. Keep any separate product-level minimum unchanged unless its requirement also changes. | **Yes**, if the agreed variant requirement is `price >= 0`; this is a direct validation mismatch and a small targeted correction. |
| No Render/CI config found | Add a Render service manifest (or precise reproducible dashboard configuration) for frontend/backend with secrets supplied only as environment settings, add a GitHub Actions workflow for install/lint/test/build, document deployment and admin bootstrap, and add a non-sensitive readiness endpoint. Do not put credentials in the manifest. | **CI: yes** before final handoff. **Render deployment: yes** if the defense requires a live demonstration; otherwise document that deployment/live operation is unverified. |
