# RevInsight AI

Motorcycle parts, accessories, reservations, service bookings, and shop operations
for Manoy's Motorcycle. The repository contains a React/Vite frontend and an
Express/Mongoose backend, with MongoDB persistence, Cloudinary media storage,
email OTP verification, and Gemini-powered shop/revenue chat.

## Requirements

- Node.js 20 or newer and npm
- MongoDB configured as a replica set (MongoDB Atlas or a local replica set).
  Reservation and service booking workflows use MongoDB transactions and will
  not work against a standalone MongoDB server.
- Cloudinary and email credentials for image uploads and OTP delivery
- A Gemini API key for AI features

## Setup

1. Install backend dependencies:

   ```sh
   cd backend
   npm ci
   ```

2. Copy `backend/.env.example` to `backend/.env` and configure the required
   database, JWT, admin, email, Cloudinary, and AI values.
3. Install frontend dependencies:

   ```sh
   cd frontend
   npm ci
   ```

4. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_API_URL` to the
   backend URL and `VITE_ADMIN_USE_MOCKS=false` to use the real admin API in
   development.
5. Start the backend and frontend in separate terminals:

   ```sh
   cd backend
   npm run dev
   ```

   ```sh
   cd frontend
   npm run dev
   ```

The frontend development server normally runs at `http://localhost:5173`, and
the backend at `http://localhost:5000`.

## Scripts

### Backend (`backend/`)

- `npm run dev` — start the API with nodemon
- `npm start` — start the API
- `npm test` — run the Vitest backend tests

### Frontend (`frontend/`)

- `npm run dev` — start the Vite development server
- `npm run build` — create the production bundle in `frontend/dist/`
- `npm run preview` — serve the production bundle locally
- `npm test` — run frontend Vitest tests
- `npm run lint` — run ESLint

## Environment templates

Use the templates in `backend/.env.example` and `frontend/.env.example`. Never
commit populated environment files or credentials.

## Service schema migration

The `Service` schema now stores `category` and `durationMinutes` as top-level
fields. Existing service documents can be backfilled once from `mongosh` with:

```javascript
db.services.updateMany(
  { $or: [{ category: { $exists: false } }, { durationMinutes: { $exists: false } }] },
  [{ $set: {
    category: { $ifNull: ['$category', 'General'] },
    durationMinutes: { $ifNull: ['$durationMinutes', 60] }
  } }]
);
```

New and updated services default to category `General` and duration 60 minutes
when these values are omitted.