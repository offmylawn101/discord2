const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

let idleTimer = null;
let isIdle = false;
let previousStatus = null;
let onIdleChange = null;

function resetTimer() {
  if (isIdle && onIdleChange) {
    isIdle = false;
    onIdleChange(false, previousStatus);
    previousStatus = null;
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!isIdle && onIdleChange) {
      isIdle = true;
      onIdleChange(true, null);
    }
  }, IDLE_TIMEOUT);
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

export function startIdleDetection(callback) {
  onIdleChange = callback;

  // Activity listeners
  for (const event of ACTIVITY_EVENTS) {
    document.addEventListener(event, resetTimer, { passive: true });
  }

  // Visibility change (tab switch)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Immediately go idle when tab is hidden
      clearTimeout(idleTimer);
      if (!isIdle && onIdleChange) {
        isIdle = true;
        onIdleChange(true, null);
      }
    } else {
      // Come back from idle when tab is visible
      resetTimer();
    }
  });

  // Start initial timer
  resetTimer();

  // Return cleanup function
  return () => {
    clearTimeout(idleTimer);
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, resetTimer);
    }
    onIdleChange = null;
  };
}

export function setIdlePreviousStatus(status) {
  previousStatus = status;
}

export function getIsIdle() {
  return isIdle;
}
