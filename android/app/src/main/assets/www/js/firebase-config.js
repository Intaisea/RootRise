// Paste the Firebase web app config from Firebase Console > Project settings > Your apps.
// Firebase client configuration is public; Firestore Security Rules protect actual data.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};
export const firebaseConfigured = !firebaseConfig.apiKey.startsWith("PASTE_") && !firebaseConfig.projectId.startsWith("YOUR_");
