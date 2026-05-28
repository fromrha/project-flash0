/**
 * LAPANG Background FCM Service Worker
 * Resolves standard browser registration traps for Web Push messaging tokens.
 */

importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// Credentials stub (automatically initialized dynamically at runtime)
const firebaseConfig = {
  apiKey: "mock-api-key",
  authDomain: "lapang-juara.firebaseapp.com",
  projectId: "lapang-juara",
  storageBucket: "lapang-juara.appspot.com",
  messagingSenderId: "mock-sender-id",
  appId: "mock-app-id"
};

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[FCM SW] Background Message Received:", payload);
  
  const notificationTitle = "SIAGA 1: Penculikan Anak!";
  const notificationOptions = {
    body: payload.data.ai_summary || "Pemberitahuan darurat penculikan anak terdekat.",
    icon: "/favicon.ico",
    tag: payload.data.token,
    requireInteraction: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
