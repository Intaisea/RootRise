# RootRise MongoDB setup

The website and Android app call the Node API in `backend/server.js`. MongoDB stores account email, display name, farm label, Argon2id password hash, consent state, sessions, and the latest ESP32 device/sensor snapshot. Raw passwords are not stored or exposed to administrators.

## Local setup
1. Install Node.js 20+ and run MongoDB locally, or create a MongoDB Atlas database. Keep the database network access restricted to the API host.
2. In `backend/`, copy `.env.example` to `.env`. Set `MONGODB_URI`, a long random `SESSION_SECRET`, your `ADMIN_EMAIL`, and a strong `ADMIN_INITIAL_PASSWORD`. Keep `.env` private; it is ignored by Git.
3. Run `npm install`, then `npm run seed-admin` to create the administrator account. After it succeeds, remove `ADMIN_INITIAL_PASSWORD` from `.env`; the running API does not need it. Public app registration cannot claim the configured admin email.
4. Configure SMTP values in `.env` for account password-reset email. Without SMTP, reset requests cannot be delivered.
5. Run `npm run dev`, then open `http://localhost:3000/admin/`. The website is served by the same API origin.

## Android and production
- Deploy the API and `www` together behind HTTPS. Set `NODE_ENV=production`, `PUBLIC_BASE_URL` to the public HTTPS website, and `ALLOWED_ORIGINS` to the web origin plus `https://appassets.androidplatform.net`.
- Put the API's public HTTPS URL in `www/js/api-config.js` and `android/app/src/main/assets/www/js/api-config.js`, then rebuild the APK. Never put the MongoDB URI, session secret, admin initial password, or SMTP password in either client file.
- Admin login is at `/admin/`. Set `ADMIN_EMAIL` and run `npm run seed-admin` from the backend directory to provision the owner account. Admins see account email/support status for all registered accounts, and see farm profile/ESP32 field data only for people who opted in. The app's phone location is excluded.
- A support reset sends a short-lived, one-use password reset link to the account's registered email. RootRise staff cannot reveal or retrieve the user's password.

## Data sharing
An account can be created without telemetry sharing. Account email and Argon2id password hash are used for sign-in and support; provisioned administrators can see registered account emails to help users recover access. Farm profile and ESP32 telemetry sync only after a separate opt-in. Users can pause future sharing in the app. Pausing hides the account's synced profile/readings from the admin directory; it does not erase the account needed to sign in. For deletion requests, handle the request through your support policy and delete the user record and related reset/session records on the server.

To provision another administrator, set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` to that person's verified account credentials in a private environment, run `npm run seed-admin`, then remove `ADMIN_INITIAL_PASSWORD`. The account must not already exist; public sign-up cannot take over the configured owner email. Email ownership verification is not implemented yet, so provision admins only for addresses you have verified yourself.
