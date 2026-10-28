# Mongoose Models

The backend defines 16 Mongoose models. Fields below include nested subdocument fields where applicable. Schemas configured with timestamps also have `createdAt` and `updatedAt`.

| Model | Collection | Schema fields |
|---|---|---|
| Admin | `admins` | `username`, `password` |
| BusinessRecord | `businessrecords` | `recordType`, `sourceId`, `customer`, `customerPhone`, `itemName`, `category`, `mechanicId`, `mechanicName`, `amount`, `laborFee`, `status`, `createdAt`, `completedAt`, `notes` |
| Cart | `carts` | `customerName`, `customerPhone`, `items[]` (`productId`, `productName`, `category`, `price`, `quantity`, `image`), `totalPrice`, `createdAt` |
| Counter | `counters` | `_id`, `sequence` |
| Mechanic | `mechanics` | `email`, `password`, `firstName`, `lastName`, `phoneNumber`, `isActive`, `role`, `specialization`, `yearsOfExperience`, `certifications[]`, `photoUrl`, `bio`, `availabilityStatus`, `totalRepairs`, `averageRating`, `successRate`, `createdBy`, timestamps |
| Notification | `notifications` | `audience`, `customerId`, `type`, `message`, `link`, `recordId`, `recordType`, `read`, `createdAt` |
| Order | `orders` | `customerName`, `customerPhone`, `items[]` (`productId`, `productName`, `category`, `price`, `quantity`), `totalPrice`, `status`, `createdAt` |
| PaymentReference | `paymentreferences` | `reference`, `recordId`, `recordType`, `createdAt` |
| PendingUser | `pendingusers` | `email`, `password`, `firstName`, `lastName`, `phoneNumber`, `otp` (`code`, `expiresAt`, `attempts`, `lastSentAt`), timestamps |
| Product | `products` | `name`, `price`, `quantity`, `reservedQty`, `category`, `image`, `imageUrl`, `imagePublicId`, `isActive` |
| Reservation | `orders` (shared with Order) | `code`, `customerId`, `customerName`, `customerPhone`, `items[]` (`productId`, `name`, `imageUrl`, `unitPrice`, `qty`, `lineTotal`), `status`, `total`, `downPaymentPercent`, `downPaymentAmount`, `amountPaid`, `balanceDue`, `paymentMethod`, `paymentReference`, `paymentProofUrl`, `paymentProofPublicId`, `paymentProofFormat`, `paymentSubmissions[]` (`reference`, `paymentProofPublicId`, `format`, `submittedAt`, `status`, `rejectionReason`, `reviewedAt`, `reviewedBy`), `rejectionReason`, `createdAt`, `paymentDueAt`, `submittedAt`, `verifiedAt`, `verifiedBy`, `paymentRejectedBy`, `paymentRejectedAt`, `reservedUntil`, `completedAt`, `cancelledAt`, `cancelReason`, `refundDecision`, `refundDecisionBy`, `refundDecisionAt`, `expiredAt` |
| ReservationSettings | `reservationsettings` | `key`, `downPaymentPercent`, `pendingPaymentHours`, `holdDays`, legacy `paymentInstructions` (`methodName`, `accountName`, `accountNumber`, `qrImageUrl`, `qrImagePublicId`), `gcashPaymentSettings` (`gcashQrUrl`, `gcashQrPublicId`, `gcashAccountName`, `gcashAccountNumber`, `paymentInstructions`, `updatedAt`), `pickupAddress`, `pickupHours`, `contactNumber`, `openDays[]`, `openTime`, `closeTime`, `slotCapacity`, `maxDaysAhead` |
| Service | `services` | `name`, `description`, `price`, `category`, `durationMinutes`, `mechanicFee`, `isActive`, timestamps |
| ServiceRequest | `servicerequests` | `user`, `customerId`, `serviceId`, `mechanic`, `mechanicId`, `serviceType`, `description`, `estimatedPrice`, `code`, `paymentStatus`, `paymentDueAt`, `paymentMethod`, `paymentReference`, `paymentProofPublicId`, `paymentProofFormat`, `paymentSubmissions[]` (`reference`, `paymentProofPublicId`, `format`, `submittedAt`, `status`, `rejectionReason`, `reviewedAt`, `reviewedBy`), `paymentSubmittedAt`, `paymentConfirmedAt`, `paymentConfirmedBy`, `paymentRejectedAt`, `paymentRejectedBy`, `paymentRejectionReason`, `refundDecision`, `refundDecisionBy`, `refundDecisionAt`, `laborFee`, `completedAt`, `status`, `statusHistory[]` (`status`, `timestamp`, `note`), `startTime`, `endTime`, `notes`, `cancelReason`, `vehicle`, `scheduledDate`, `createdAt`, `updatedAt` |
| ServiceSlotLock | `serviceslotlocks` | `dateKey`, `startTime`, `bookingVersion`, timestamps |
| User | `users` | `email`, `password`, `firstName`, `lastName`, `phoneNumber`, `name`, `otp` (`code`, `expiresAt`), `isEmailVerified`, `isActive`, `isDeleted`, `deletedAt`, `role`, `preferences` (`newsletter`, `notifications`, `preferredContactMethod`), `profileImage`, `totalPurchases`, `totalSpent`, `firstPurchaseDate`, `lastPurchaseDate`, `lastReceiptDate`, timestamps |
