
// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCDmkiclfBD3qP8K7ILakcl_JwJiiZXSBI",
  authDomain: "adjstudios.firebaseapp.com",
  databaseURL: "https://adjstudios-default-rtdb.firebaseio.com",
  projectId: "adjstudios",
  storageBucket: "adjstudios.firebasestorage.app",
  messagingSenderId: "85914193622",
  appId: "1:85914193622:web:a52f2a32877f0d321e0377",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/assets/icon-192.png' // Asegúrate de tener un icono en esta ruta
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
