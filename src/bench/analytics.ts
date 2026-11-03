/**
 * Google Analytics, only where a host asks for it. The ID comes from the build environment (VITE_GA_ID,
 * set on the Webflow Cloud environment for kerem.co), so local runs and anyone else's copy of the bench
 * load nothing and send nothing.
 */
type Gtag = (...args: unknown[]) => void;

export function startAnalytics(id = import.meta.env.VITE_GA_ID) {
  if (!id) return;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer || [];
  // gtag.js reads Arguments objects off the dataLayer, not arrays, hence `arguments`
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', id);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}
