# RootRise shared cloud setup (Firebase)

The app and admin portal use Firebase Authentication (email/password) and Cloud Firestore. The web SDK configuration is a public client config; never put a service-account key or admin secret in the app or website.

## Configure the project
1. Create a Firebase project and register a Web app in Firebase Console.
2. Enable **Authentication → Email/Password** and create a **Cloud Firestore** database.
3. Copy the Web app config into `www/js/firebase-config.js` and the matching Android asset file `android/app/src/main/assets/www/js/firebase-config.js`.
4. Publish `firestore.rules` in Firestore Rules.
5. Host `www` on HTTPS (Firebase Hosting works) and add its domain and `appassets.androidplatform.net` to Firebase Authentication authorized domains.
6. Create your own user in the app. In Firestore Console, add `admins/{YOUR_AUTH_UID}` as an empty document. Admin documents can only be created in the Firebase Console, never by a client. Use this account to sign in at `/admin/`.

Only people who create an account and accept the data-sharing checkbox are synced. The app sends their name, email, farm label, controller connection state, and latest ESP32 sensor values. ESP32 farm GPS is synced with that consent; phone location is not synced. Users can opt out; owner access is limited to their own records, and only the manually provisioned admin account can list users. The app does not sync passwords.

## Data model
- `users/{uid}`: account/profile, sharing consent, latest device status, last seen.
- `users/{uid}/telemetry/latest`: most recent sensor and pump snapshot.
- `admins/{uid}`: console-provisioned admin marker.

Use the supplied Firestore rules. Keep your Firebase project in test mode only during local development; switch to these rules before inviting users.

To run locally, serve `www` from localhost (ES modules and Firebase Auth do not work from a `file://` URL). Open `/admin/` for the dashboard.
