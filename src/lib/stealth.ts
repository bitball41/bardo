export function openStealthWindow(src = location.href, options?: { title?: string; favicon?: string }) {
  if (window.__bardoLaunchAboutBlank) return window.__bardoLaunchAboutBlank(src, options);
  return false;
}
