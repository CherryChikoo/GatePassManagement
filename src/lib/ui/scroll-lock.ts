/**
 * Page scroll lock shared by every popup. Counted, so when popups open and close
 * over each other the page is locked while any is open and always unlocked when
 * the last one closes (it can never be left stuck, or freed early).
 */
let locks = 0;

export function lockPageScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  locks += 1;
  if (locks === 1) document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = "";
  };
}
