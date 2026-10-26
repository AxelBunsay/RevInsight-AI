# Test Inventory

The complete backend run contained **18 test files and 96 passing tests**, including the 4 integration files and 29 integration cases below. The frontend verification contained **2 files and 7 passing tests**. There were no failed or skipped tests. Parameterized test names below describe each generated case.
The frontend `api.test.js` cases are split across the Payments and Security sections, so that file is listed twice by feature.

## Authentication

- `backend/tests/authMiddleware.test.js` — `allows a token whose role is permitted`; `rejects a valid token with a disallowed role`; `rejects a missing token`.
- `backend/tests/customerAccount.test.js` — `accepts a Philippine mobile number in %s format` (international, local-with-zero, and local-without-zero formats); `rejects a non-mobile phone number`; `requires a strong password and Philippine mobile number for registration`; `requires an eight-character password with a letter and number for mechanic creation`.

## Reservations

- `backend/tests/integration/reservations.test.js` — `creates a reservation with computed total, down payment, and balance`; `prevents a second customer from reserving more than remaining stock`; `moves a reservation to Payment Submitted with a reference and receipt`; `rejects a duplicate payment reference number`; `admin confirmation reserves the requested product stock`; `admin rejection returns the reservation to Pending Down Payment with a reason`; `completes pickup, lowers stock, clears balance, and creates one revenue record`; `expires an unpaid reservation after its payment deadline`; `expires a Reserved reservation after hold days and releases its stock`; `does not allow a customer to cancel while payment is submitted`; `does not allow a customer to read another customer reservation`.

- `backend/tests/reservationStatus.test.js` — `allows %s -> %s` for Pending Down Payment → Payment Submitted/Cancelled/Expired, Payment Submitted → Reserved/Pending Down Payment/Cancelled, Reserved → Completed/Cancelled/Expired, and Expired → Cancelled; `rejects %s -> %s` for Completed → Cancelled, Cancelled → Reserved, Payment Submitted → Completed, Pending Down Payment → Completed, and Unknown → Cancelled.
- `backend/tests/reservationHardening.test.js` — `continues expiring candidates when one candidate transaction fails`; `returns the specific conflict message when payment is under review`; `cancels pending down payment with an expected-status conditional update`.

## Payments

- `backend/tests/paymentReceipt.test.js` — `accepts a 10-to-20 digit reference`; `rejects invalid reference %s` for too-short, too-long, whitespace-containing, and nonnumeric references; `accepts a PNG with a real PNG signature`; `generates an authenticated download URL expiring in five minutes`; `rejects a file whose claimed type does not match its bytes`; `rejects receipts larger than 2 MB`.
- `frontend/src/services/api.test.js` — `sends a receipt and reference for a %s` (item reservation and service booking).

## Services

- `backend/tests/integration/services.test.js` — `uses the configured service price and mechanic fee instead of client-supplied values`; `rejects a second booking when the selected slot is at capacity`; `rejects a closed day and a time that has already passed`; `does not allow an unpaid booking to start or complete`; `mechanic accept, start, and complete creates one revenue record with the configured labor fee`; `does not allow admin completion or reopening a completed booking`; `removes the service revenue record when an admin cancels the booking`; `expires an unpaid booking and makes its slot available again`; `limits each customer to three active unpaid bookings`.

- `backend/tests/serviceBookingHardening.test.js` — `blocks unpaid $nextStatus transitions` (assigned → in-progress and in-progress → completed); `blocks admin completion and reopening completed bookings`; `deletes a service BusinessRecord when the admin cancels a booking`; `requires an admin refund decision before cancelling a confirmed service booking`; `does not create service revenue for a completed booking without confirmed payment`; `expires an unpaid pending booking past its deadline`; `rejects a fourth active unpaid booking for a customer`.
- `backend/tests/serviceSchema.test.js` — `stores category and durationMinutes as top-level fields with legacy defaults`; `retains the mechanic fee cannot exceed service price validator`; `validates the configured category and duration values`.

## Revenue

- `backend/tests/integration/revenue.test.js` — `keeps dashboard, quarterly, sales report, and concentration totals consistent`; `groups an 11:30 PM Manila sale into the correct local date, month, and quarter`; `reports forfeited down payments separately without counting them as sales`; `ignores the in-progress quarter and reports insufficient data below five completed quarters`.
- `backend/tests/aiController.test.js` — `rejects failed dashboard controller responses`; `includes exactly the latest 24 Manila calendar months and fills missing buckets`; `rejects questions longer than 500 characters with HTTP 400`.
- `backend/tests/revenue.test.js` — `normalizes completed orders, reservations, and services using the shared amounts`; `groups dates and quarters in Asia/Manila for sales around local midnight`; `uses Manila timezone operators and the specified date fields in source pipelines`; `projects the next quarter from average historical quarter growth`.
- `backend/tests/mechanicsReport.test.js` — `joins the service request collection by mechanic references and sums completed labor fees`.

## Security

- `backend/tests/integration/security.test.js` — `rejects every role from three routes belonging to another role`; `rejects a deleted customer using a previously issued token`; `blocks account deletion when an active reservation exists`; `blocks account deletion when an accepted service booking exists`; `anonymizes historical customer records without changing their amounts or dates`.
- `backend/tests/securityHardening.test.js` — `defaults pending OTP attempt tracking`; `rejects oversized AI chat messages before calling Gemini`; `returns 401 for invalid admin credentials`; `updates only a valid transaction status and ignores revenue fields`.
- `frontend/src/services/api.test.js` — `does not attach or clear the admin token on failed customer login`; `keeps the customer token when a protected password request returns 401`; `clears and redirects only the customer token after a real customer 401`; `does not clear a token for the delete-account endpoint`.

## Inventory

- `backend/tests/productImage.test.js` — `accepts PNG bytes with matching MIME type`; `accepts JPEG bytes with matching MIME type`; `accepts WEBP bytes with matching MIME type`; `rejects a mismatched MIME type or invalid image bytes`; `rejects images larger than 2 MB`.
- `backend/tests/inventoryReport.test.js` — `uses available stock for low-stock counts and values active products only`.
- `backend/tests/mechanicStats.test.js` — `counts scheduled statuses and sums completed labor fees only`; `returns available stock, honors shared threshold, and preserves absolute image URLs`.
- `frontend/src/admin/services/adminApi.test.js` — `uses available stock and the shared low-stock threshold`.
