/**
 * Scrolls the page back to the top. Inside the portal the page scrolls in the
 * layout's own scroll area (marked data-page-scroll), not the window — so
 * window.scrollTo alone does nothing there.
 */
export function scrollPageToTop() {
  if (typeof document === "undefined") return;
  const area = document.querySelector<HTMLElement>("[data-page-scroll]");
  area?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
}
