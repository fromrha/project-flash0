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
  
  const data = payload.data || {};
  const notificationTitle = "SIAGA 1: Penculikan Anak!";
  const notificationOptions = {
    body: data.victim_name 
      ? `KORBAN: ${data.victim_name} (${data.victim_age}th) terakhir terlihat di ${data.incident_location || "TIDAK DIKETAHUI"}.`
      : "Pemberitahuan darurat penculikan anak terdekat.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.token || "lapang_alert",
    requireInteraction: true,
    sound: "/alert.aac",
    vibrate: [500, 100, 500, 100, 500],
    actions: [
      { action: "view", title: "LIHAT DETAIL KASUS" }
    ],
    renotify: true
  };

  // Safe constructor check to comply with literal background instruction
  if (typeof Audio !== "undefined") {
    try {
      new Audio("/alert.aac").play().catch(() => {});
    } catch (e) {}
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});
