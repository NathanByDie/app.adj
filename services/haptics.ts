import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Provides different haptic feedback patterns using the native Capacitor API if available,
 * with a fallback to the web Vibration API for browsers. This enhances user experience
 * on native devices with more distinct feedback types.
 */
export const triggerHapticFeedback = async (pattern: 'light' | 'success' | 'notification' | 'error' | 'unread_message' = 'light') => {
  // Use native haptics on mobile devices for a better experience
  if (Capacitor.isNativePlatform()) {
    try {
      switch (pattern) {
        case 'light':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'success':
          await Haptics.notification({ type: NotificationType.Success });
          break;
        case 'notification':
          await Haptics.notification({ type: NotificationType.Warning });
          break;
        case 'error':
          await Haptics.notification({ type: NotificationType.Error });
          break;
        case 'unread_message':
          // The native API doesn't support complex patterns, so we use a medium vibration.
          await Haptics.vibrate({ duration: 400 });
          break;
        default:
          await Haptics.impact({ style: ImpactStyle.Light });
      }
      return; // Exit if native feedback was successful
    } catch (e) {
      console.warn("Native haptics failed, falling back to web vibrate:", e);
      // If native fails for some reason, fall through to the web API
    }
  }

  // Web Vibrate API Fallback for browsers
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      switch (pattern) {
        case 'light':
          window.navigator.vibrate(50);
          break;
        case 'success':
          window.navigator.vibrate([100, 50, 100]);
          break;
        case 'notification':
          window.navigator.vibrate([200, 100, 200]);
          break;
        case 'error':
          window.navigator.vibrate([75, 50, 75, 50, 75]);
          break;
        case 'unread_message':
          window.navigator.vibrate([500, 100, 500]);
          break;
        default:
          window.navigator.vibrate(50);
      }
    } catch (e) {
      console.error("Web vibration failed:", e);
    }
  }
};
