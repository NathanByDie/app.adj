
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

exports.onNewMessage = functions.firestore
    .document("chats/{chatId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
      const messageData = snapshot.data();
      const chatId = context.params.chatId;
      const senderId = messageData.senderId;

      // 1. Identificar al destinatario
      const participants = chatId.split("_");
      const recipientId = participants.find((id) => id !== senderId);

      if (!recipientId) {
        console.log("No se pudo determinar el destinatario para el chatId:", chatId);
        return null;
      }

      // 2. Obtener los documentos del remitente y del destinatario
      const senderDoc = await db.collection("users").doc(senderId).get();
      const recipientDoc = await db.collection("users").doc(recipientId).get();

      if (!senderDoc.exists) {
        console.error("El documento del remitente no existe:", senderId);
        return null;
      }
      if (!recipientDoc.exists) {
        console.error("El documento del destinatario no existe:", recipientId);
        return null;
      }

      const senderData = senderDoc.data();
      const recipientData = recipientDoc.data();

      // 3. Actualizar la lista de chats del destinatario (CORE FIX)
      const recipientChatRef = db.doc(`user_chats/${recipientId}/chats/${chatId}`);

      let lastMessageText;
      if (messageData.deleted) {
          lastMessageText = "Mensaje eliminado";
      } else if (messageData.type === 'text') {
          lastMessageText = '🔒 Texto cifrado';
      } else if (messageData.type === 'image') {
          lastMessageText = '📷 Imagen';
      } else if (messageData.type === 'audio') {
          lastMessageText = '🎤 Nota de voz';
      } else if (messageData.type === 'video') {
          lastMessageText = '📹 Video';
      } else if (messageData.type === 'file') {
          lastMessageText = `📄 ${messageData.fileName || 'Archivo'}`;
      } else {
          lastMessageText = 'Nuevo mensaje';
      }

      const chatInfoUpdate = {
        lastMessageText,
        lastMessageTimestamp: messageData.timestamp,
        lastMessageSenderId: senderId,
        unreadCount: admin.firestore.FieldValue.increment(1),
        partnerId: senderId,
        partnerUsername: senderData.username,
        partnerPhotoURL: senderData.photoURL || null,
        partnerValidated: senderData.profileValidated === true,
      };

      try {
        await recipientChatRef.set(chatInfoUpdate, { merge: true });
        console.log(`Lista de chats actualizada para el destinatario: ${recipientId}`);
      } catch (error) {
        console.error("Error al actualizar la lista de chats del destinatario:", error);
      }

      // 4. Enviar Notificación Push
      const fcmToken = recipientData.fcmToken;
      if (!fcmToken) {
        console.log("El destinatario no tiene un token FCM.");
        return null;
      }

      let notificationBody;
      switch (messageData.type) {
        case "image":
          notificationBody = "Te ha enviado una imagen.";
          break;
        case "audio":
          notificationBody = "Te ha enviado una nota de voz.";
          break;
        default:
          notificationBody = "Te ha enviado un nuevo mensaje.";
      }
      
      const payload = {
        notification: {
          title: `Nuevo mensaje de ${senderData.username}`,
          body: notificationBody,
          sound: "default",
          badge: "1",
        },
        data: {
          chatId: chatId,
          senderId: senderId,
        },
      };

      try {
        await admin.messaging().sendToDevice(fcmToken, payload);
        console.log("Notificación push enviada con éxito.");
      } catch (error) {
        console.error("Error al enviar la notificación push:", error);
      }

      return null;
    });
