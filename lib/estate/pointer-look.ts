// Relative mouse deltas are delivered to document. Touch and denied capture continue to use drag.
export function bindMouseLook(
  host: HTMLElement,
  enabled: () => boolean,
  rotate: (yaw: number, pitch: number) => void,
  changed: (locked: boolean, denied: boolean) => void,
) {
  const doc = host.ownerDocument;
  let mounted = true,
    pending = false;
  const locked = () => doc.pointerLockElement === host;
  const release = () => {
    pending = false;
    if (locked()) doc.exitPointerLock();
  };
  const change = () => {
    if (locked() && (!pending || !enabled())) {
      release();
      return;
    }
    if (!locked()) pending = false;
    changed(locked(), false);
  };
  const denied = () => {
    if (mounted && pending) {
      pending = false;
      changed(false, true);
    }
  };
  const move = (e: MouseEvent) => {
    if (locked() && enabled())
      rotate(e.movementX * 0.0021, e.movementY * 0.0021);
  };
  doc.addEventListener("mousemove", move);
  doc.addEventListener("pointerlockchange", change);
  doc.addEventListener("pointerlockerror", denied);
  return {
    locked,
    release,
    capture() {
      if (!enabled() || pending || locked()) return;
      pending = true;
      try {
        if (!host.requestPointerLock) {
          denied();
          return;
        }
        // Both the legacy void and modern Promise signatures occur in browsers.
        Promise.resolve(host.requestPointerLock()).catch(denied);
      } catch {
        denied();
      }
    },
    dispose() {
      mounted = false;
      release();
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("pointerlockchange", change);
      doc.removeEventListener("pointerlockerror", denied);
    },
  };
}
