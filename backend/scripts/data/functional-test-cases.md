RevInsight AI - Functional Test Cases FT-001 to FT-043
Source: RevInsight_Functional_Testing_Questionnaire.docx

## A. Account Access (Customers, Mechanics, Admin)

FT-001
  TEST CASE: Register a customer account with valid details (name, email, username, 11-digit mobile starting with 09, password of at least 8 characters with a letter and a number); then enter (a) a wrong OTP, (b) the correct emailed OTP.
  EXPECTED: A verification code is sent to the email; a wrong OTP shows “Invalid OTP.”; the correct OTP creates the account and the customer can log in.

FT-002
  TEST CASE: Submit the registration form with: (a) a required field empty; (b) a weak password; (c) an invalid mobile number; (d) an email or username that is already used.
  EXPECTED: Each case is rejected with its own message (for example “Email already in use” or “Username is already taken”) and no account is created.

FT-003
  TEST CASE: Log in with valid credentials as a Customer, as Owner/Admin, and as a Mechanic.
  EXPECTED: Each role is authenticated and its own dashboard or pages open.

FT-004
  TEST CASE: Log in with: (a) a wrong password or an unregistered account; (b) an empty field; (c) repeated failures beyond the login limit (default 5 attempts within 2 minutes).
  EXPECTED: “Invalid credentials” or a required-field message appears with no access; after the limit, further attempts are temporarily blocked.

FT-005
  TEST CASE: (a) Open protected pages by direct URL without logging in; (b) as a Customer, open Admin pages; (c) as a Mechanic, open Admin and Customer-only pages; (d) as the second Customer, open the first Customer’s reservation or booking; (e) log out and use the browser back button.
  EXPECTED: Access is denied or redirected in every case, and no protected or other users’ data is displayed.

FT-006
  TEST CASE: Turn on two-step verification using the current password, log out, and log in again: (a) enter the correct 6-digit code; (b) enter a wrong code. Then turn the setting off.
  EXPECTED: The correct code signs the customer in; a wrong code is rejected; the setting changes only with the correct password, and login no longer asks for a code once it is off.

FT-007
  TEST CASE: (a) Edit name and mobile number and upload a JPG or PNG photo (5 MB or less); (b) try an empty name, an invalid mobile number, a non-JPG/PNG file, and an image over 5 MB; (c) change the password with valid and invalid entries.
  EXPECTED: Valid changes are saved and the new password works; each invalid entry is rejected with a message and nothing is changed.

## B. Product Catalog and Item Reservation (Customers, Admin)

FT-008
  TEST CASE: Browse the shop, use search and filters, and select a variant of a product that has variants.
  EXPECTED: Products show price and stock status; filters return only matching products; the chosen variant’s price and stock are shown, and a variant must be chosen before adding.

FT-009
  TEST CASE: Add a product to the cart, change the quantity, and remove an item; then try a quantity of 0, a decimal, more than the available stock, and an out-of-stock product.
  EXPECTED: Valid changes update the cart totals; invalid quantities are rejected with a message, and out-of-stock items cannot be reserved.

FT-010
  TEST CASE: Check out the cart, then submit a GCash down payment with a reference number and receipt; try a reference number that was already used.
  EXPECTED: A reservation with a code, total, down payment, and balance is created and stock is reserved; the payment is sent for review and the Admin is notified; a repeated reference shows “This reference number was already used.”

FT-011
  TEST CASE: As Admin, review a submitted payment: (a) confirm it; (b) reject another with a valid reason; (c) try rejecting with no reason or a very short one.
  EXPECTED: Confirmation records the payment and notifies the customer; a rejection needs a reason of 3 to 300 characters, otherwise an error message appears.

FT-012
  TEST CASE: As Admin: (a) mark a confirmed reservation as paid at the shop and complete it; (b) cancel another paid reservation, choosing refunded or forfeited with a reason.
  EXPECTED: Completion deducts stock permanently and creates one revenue record; cancellation requires a refund decision and a reason and releases the reserved stock.

FT-013
  TEST CASE: As Customer: (a) cancel a reservation with a reason; (b) leave another one unpaid past the deadline (use a short deadline for testing); (c) open My Purchases and filter the records.
  EXPECTED: Cancelled and expired reservations release their stock; My Purchases lists only the customer’s own records with correct status and amounts.

## C. Service Booking and Quotes (Customers, Mechanics, Admin)

FT-014
  TEST CASE: Browse the services, open a service detail page, and book a service with a valid date, available time, motorcycle, mechanic, and parts from the shop.
  EXPECTED: Each service shows its price (or estimated range), duration, and category; the booking is created with the correct total, payment instructions, and the time slot reserved.

FT-015
  TEST CASE: Submit a booking with: (a) the motorcycle, time, or parts source left empty; (b) a day the shop is closed (Sunday under default settings); (c) a time that has already passed today; (d) units above the maximum of a per-unit service.
  EXPECTED: Each case is rejected with a message asking for the missing choice, stating the shop is closed, or asking for an available time or valid units.

FT-016
  TEST CASE: (a) Book the same time slot until its capacity is reached; (b) choose a mechanic who is on leave.
  EXPECTED: A full slot shows “That time was just booked. Please choose another.”; a mechanic on leave is rejected with a message to choose another mechanic.

FT-017
  TEST CASE: Book a service with customer-supplied parts that needs a quote: (a) without describing the parts; (b) with a description, then accept the mechanic’s quote; (c) reject a quote in another booking.
  EXPECTED: “Describe the parts you will provide.” appears for (a); (b) continues the booking at the quoted price; (c) does not proceed.

FT-018
  TEST CASE: As Admin, confirm a service booking payment and assign an available mechanic; then try to assign an unavailable mechanic.
  EXPECTED: The booking is confirmed and the mechanic is assigned and notified; an unavailable mechanic cannot be assigned.

FT-019
  TEST CASE: As Customer, rate the mechanic from 1 to 5 stars with a comment after completion; then try to rate before completion, rate twice, use 0 or 6 stars, or write a comment over 300 characters.
  EXPECTED: A valid rating is saved and the mechanic is notified; each invalid attempt is rejected with a message and no extra rating is saved.

## D. Mechanic Job Management (Mechanics, Admin)

FT-020
  TEST CASE: As Mechanic, open the dashboard and the job lists.
  EXPECTED: Workload counts and earnings match the mechanic’s own jobs only.

FT-021
  TEST CASE: Accept a job with a start time inside shop hours, start it, and complete it; also try (a) accepting before payment is confirmed, (b) a start time outside shop hours, (c) completing another mechanic’s booking.
  EXPECTED: The job moves from accepted to in progress to completed and revenue is recorded once; each invalid attempt is rejected with a message (for example “Payment is not confirmed yet.” or “Only the assigned mechanic can complete a booking.”).

FT-022
  TEST CASE: Submit a quote for a labor-only request; try a price of 0; decline another request with a reason.
  EXPECTED: A valid quote is sent to the customer; a price of 0 shows “Quote price must be greater than zero.”; a decline needs a reason of 3 to 500 characters.

FT-023
  TEST CASE: Open the mechanic profile and the Admin mechanics list after services have been completed and rated.
  EXPECTED: Average rating, rating count, recent ratings, jobs, and earnings match the completed jobs and ratings given; “No ratings yet.” appears when there are none.

FT-024
  TEST CASE: As Admin, add, edit, and delete a mechanic, and change a mechanic’s availability status (Available, Busy, On leave).
  EXPECTED: Changes are saved; a mechanic who is on leave cannot be chosen for new bookings.

## E. Inventory, Transactions and Records (Admin)

FT-025
  TEST CASE: Add a product with valid details (name, category, price, stock, image); then try a name under 2 characters, a price of 0, a negative stock, or a decimal stock.
  EXPECTED: The valid product is saved once and appears in Inventory and the shop; invalid values show field messages and nothing is saved.

FT-026
  TEST CASE: Add a product with variants, edit a product’s price and stock, then delete a product with no history and one that appears in past records.
  EXPECTED: Variants are saved and selectable by customers; edits appear in Inventory and the shop; the product with history is archived so past records remain intact.

FT-027
  TEST CASE: Reduce a product’s available stock to the low-stock level (10 or fewer), then to 0.
  EXPECTED: The product is flagged as low stock, then out of stock, and the Admin receives one notification for each change.

FT-028
  TEST CASE: Add a service with name, category (Repair, Installation, Maintenance, Customization, or General), price, mechanic fee, and duration; then try a duplicate name, a price of 0, a duration over 1,440 minutes, or a maximum labor price lower than the minimum; then edit and delete a service.
  EXPECTED: The valid service is saved under its category and shown to customers; invalid entries are rejected with a message; deleting a service keeps past booking and revenue records.

FT-029
  TEST CASE: Open Transactions, switch between the items and services tabs, and apply search and status filters.
  EXPECTED: Lists show only matching records with the correct customer, amounts, and status.

FT-030
  TEST CASE: Update the reservation settings (down payment percentage, payment deadline, pickup details), the GCash details, and the booking schedule, using valid values and invalid ones (for example, a deadline of 0 hours or a closing time not later than the opening time).
  EXPECTED: Valid values are saved and used by new reservations, the payment screen, and the time slots; invalid values are rejected.

## F. Revenue Monitoring and Concentration Analysis (Admin)

FT-031
  TEST CASE: Open the dashboard and review the summary figures; switch the sales chart between daily, weekly, and monthly.
  EXPECTED: Figures match the confirmed and completed records for the period; the chart updates and its totals match the recorded sales.

FT-032
  TEST CASE: Review revenue by category and the Service revenue panel.
  EXPECTED: Category totals add up to the total revenue; service revenue, completed jobs, average per job, share of total revenue, revenue by service category, and top services match the completed service records.

FT-033
  TEST CASE: Complete a new sale and a new service, then refresh the dashboard; also open the dashboard for a period with no records.
  EXPECTED: Figures update to include the new records; an empty period shows a clear empty state with no errors or invalid values (such as NaN).

FT-034
  TEST CASE: Review the inventory health panel and the low-stock list.
  EXPECTED: In-stock, low-stock, and out-of-stock counts match the Inventory page.

FT-035
  TEST CASE: Open Revenue Analysis and review the quarter-over-quarter change, concentration, top contributor share, and forecast cards; then open it with fewer than five completed quarters of data.
  EXPECTED: Values match a manual computation, each risk level (Normal, Moderate, High) follows the configured thresholds, and top revenue sources are ranked correctly; with too little data an insufficient-data state is shown instead of a risk rating.

## G. AI-Assisted Insights (Admin)

FT-036
  TEST CASE: Use Ask AI with a valid revenue question.
  EXPECTED: A written answer consistent with the dashboard figures covers what the data shows, what is likely next, and suggested actions.

FT-037
  TEST CASE: Submit Ask AI with an empty question and with one over 500 characters; then use Ask AI while the AI service is unavailable (for example, an invalid API key).
  EXPECTED: Invalid questions are rejected with a message and do not call the AI; when the AI is unavailable a clear error appears and the rest of the dashboard keeps working.

FT-038
  TEST CASE: Review the AI insights on the revenue cards, then refresh them twice within 30 seconds.
  EXPECTED: Each card shows descriptive, predictive, and prescriptive text of 25 words or fewer; a refresh within 30 seconds shows “Please wait before refreshing revenue insights again.”

FT-039
  TEST CASE: Inspect the data sent to the AI through an authorized technical check.
  EXPECTED: The request contains only summarized revenue data and no customer personal information such as names or emails.

## H. Reports, System Integrity and Overall Operation (All)

FT-040
  TEST CASE: Export a report for a selected quarter or month, and download the Transactions CSV with filters applied.
  EXPECTED: The report opens for printing or saving as PDF and the CSV opens correctly; both show the correct period, rows, and totals, and an empty period shows a clear empty result.

FT-041
  TEST CASE: (a) Have two customers reserve the last available unit of a product at the same time; (b) complete the same reservation or booking twice (for example, by double-clicking).
  EXPECTED: Only one reservation succeeds so stock is never oversold; revenue is recorded only once.

FT-042
  TEST CASE: Trigger a notification for each role (payment submitted, payment decision, new rating, low stock), open the bell, mark one as read, and clear them.
  EXPECTED: Each notification reaches the right role only, shows the correct message, and can be marked read and cleared.

FT-043
  TEST CASE: Open the shop, service booking, and Admin dashboard on a mobile phone and on a computer.
  EXPECTED: Pages display and work correctly on both devices without overlapping or cut-off content.
