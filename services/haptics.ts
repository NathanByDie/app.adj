/**
 * Provides different haptic feedback patterns.
 * Ensures vibration is only triggered if the API is available.
 */

// A short, crisp vibration for successful actions or UI feedback.
export const triggerHapticFeedback = (pattern: 'light' | 'success' | 'notification' | 'error' = 'light') => {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      switch (pattern) {
        case 'light':
          // A single, short vibration. Good for selection changes or swipe actions.
          window.navigator.vibrate(50);
          break;
        case 'success':
          // Two short vibrations. Good for completing an action.
          window.navigator.vibrate([100, 50, 100]);
          break;
        case 'notification':
          // A longer vibration for notifications.
          window.navigator.vibrate([200, 100, 200]);
          break;
        case 'error':
            // A distinct double-buzz to indicate an error.
            window.navigator.vibrate([75, 50, 75, 50, 75]);
            break;
        default:
          window.navigator.vibrate(50);
      }
    } catch (e) {
      console.error("Vibration failed:", e);
    }
  }
};
