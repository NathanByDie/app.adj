
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

exports.sendChatNotification = functions.firestore
    .document("chats/{chatId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
      const messageData = snapshot.data();
      const chatId = context.params.chatId;
      const senderId = messageData.senderId;

      // 1. Identificar al destinatario
      const participants = chatId.split("_");
      const recipientId = participants.find((id) => id !== senderId);

      if (!recipientId) {
        console.log("No se pudo determinar el destinatario.");
        return null;
      }

      // 2. Obtener el token FCM del destinatario y el nombre del remitente
      const recipientDoc = await db.collection("users").doc(recipientId).get();
      const senderDoc = await db.collection("users").doc(senderId).get();

      if (!recipientDoc.exists || !senderDoc.exists) {
        console.log("No se encontró el remitente o el destinatario.");
        return null;
      }

      const recipientData = recipientDoc.data();
      const fcmToken = recipientData.fcmToken;
      const senderName = senderDoc.data().username;

      if (!fcmToken) {
        console.log("El destinatario no tiene un token FCM registrado.");
        return null;
      }

      // 3. Determinar el contenido de la notificación
      let notificationBody;
      switch (messageData.type) {
        case "image":
          notificationBody = `${senderName} te ha enviado una imagen.`;
          break;
        case "audio":
          notificationBody = `${senderName} te ha enviado una nota de voz.`;
          break;
        default:
          notificationBody = messageData.text;
      }

      // 4. Construir el payload de la notificación
      const payload = {
        notification: {
          title: `Nuevo mensaje de ${senderName}`,
          body: notificationBody,
          sound: "default",
          badge: "1",
        },
        data: {
          // Datos adicionales para que la app sepa a dónde navegar
          chatId: chatId,
          senderId: senderId,
        },
      };

      // 5. Enviar la notificación
      try {
        console.log(`Enviando notificación a ${recipientId} con token ${fcmToken}`);
        await admin.messaging().sendToDevice(fcmToken, payload);
        console.log("Notificación enviada con éxito.");
      } catch (error) {
        console.error("Error al enviar la notificación:", error);
      }

      return null;
    });
