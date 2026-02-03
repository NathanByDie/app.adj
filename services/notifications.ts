
import { FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

let isInitialized = false;

// VAPID key from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates
const VAPID_KEY = 'BAcW5Z-9i3...'; // Reemplazar con tu clave real

/**
 * Handles the registration logic for both web and native platforms.
 */
const registerForPush = async (app: FirebaseApp, db: any, userId: string): Promise<string | null> => {
    if (Capacitor.isNativePlatform()) {
        console.log('Registering for push on native platform...');
        
        // 1. Request permissions
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
            throw new Error('User denied permissions!');
        }

        // 2. Register with Apple / Google to get a device token
        await PushNotifications.register();

        // 3. Get the token
        return new Promise<string>((resolve, reject) => {
            PushNotifications.addListener('registration', (token: Token) => {
                console.log('Push registration success, token:', token.value);
                resolve(token.value);
            });
            PushNotifications.addListener('registrationError', (err: any) => {
                console.error('Push registration error:', err);
                reject(err);
            });
        });

    } else {
        console.log('Registering for push on web platform...');
        try {
            const messaging = getMessaging(app);
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                const token = await getToken(messaging, { vapidKey: VAPID_KEY });
                console.log('Web FCM Token:', token);
                return token;
            } else {
                console.warn('Notification permission not granted.');
                return null;
            }
        } catch (error) {
            console.error('An error occurred while retrieving token. ', error);
            return null;
        }
    }
};

/**
 * Initializes push notification listeners and saves the token.
 */
export const initializePushNotifications = async (app: FirebaseApp, db: any, userId: string, onNotificationTap: (chatId: string) => void) => {
    if (isInitialized || !userId) return;
    isInitialized = true;
    console.log('Initializing Push Notifications for user:', userId);
    
    try {
        const token = await registerForPush(app, db, userId);
        if (token) {
            const userDocRef = doc(db, 'users', userId);
            await updateDoc(userDocRef, { fcmToken: token });
        }
    } catch (error) {
        console.error('Failed to initialize push notifications:', error);
        return; // Stop if registration fails
    }

    // --- Add Listeners ---

    if (Capacitor.isNativePlatform()) {
        // Handle notification when the app is in the foreground
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
            console.log('Push received in foreground:', notification);
            // Here you could show an in-app banner
        });

        // Handle notification when the app is opened by tapping the notification
        PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
            console.log('Push action performed:', notification);
            const chatId = notification.notification.data.chatId;
            if (chatId) {
                onNotificationTap(chatId);
            }
        });
    } else {
        // Handle foreground messages for web
        const messaging = getMessaging(app);
        onMessage(messaging, (payload) => {
            console.log('Message received in web foreground. ', payload);
            // Optionally show a custom toast notification
        });
    }
};
