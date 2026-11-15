/**
 * The inline GA4 gtag bootstrap rendered by pages/+Head.tsx (SSR), before
 * gtag.js loads, so the very first `gtag("config")` already carries what it
 * needs.
 *
 * GA4_CLIENT_ID_CONTINUITY (pageContext.trackingFlags.ga4ClientIdContinuity):
 * - a valid `_ga` cookie (GA1.<n>.<digits>.<digits>) → its client id is
 *   saved to localStorage "perce_ga_cid" when different; nothing else changes
 * - no valid `_ga` cookie, but a valid stored client id (<digits>.<digits>) →
 *   it is passed as `client_id` to the config call, so GA4 keeps the same
 *   visitor when a browser drops the cookie but keeps localStorage
 *   (hypothesis: some iOS in-app browsers)
 * - otherwise nothing: an id is never invented and a valid `_ga` is never
 *   overridden. Every storage / cookie access is inside try/catch.
 *
 * Flag off → the exact previous snippet, byte for byte.
 *
 * Plain ES5 on purpose: it is emitted verbatim into the HTML and runs before
 * any bundle. Tested by executing this exact string
 * (shared/tracking/__tests__/ga4-head-snippet.test.ts).
 */

export const GA4_CID_STORAGE_KEY = "perce_ga_cid";

const BOOTSTRAP =
  'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());';

export function buildGa4HeadSnippet(measurementId: string, opts: { clientIdContinuity: boolean }): string {
  const id = JSON.stringify(measurementId);
  if (!opts.clientIdContinuity) {
    return `${BOOTSTRAP}gtag("config",${id},{send_page_view:false});`;
  }
  const key = JSON.stringify(GA4_CID_STORAGE_KEY);
  // biome-ignore format: emitted verbatim
  const continuity = String.raw`(function(){var o={send_page_view:false};try{var m=null,p=document.cookie.split(";");for(var i=0;i<p.length;i++){var k=p[i].replace(/^\s+/,"");if(k.indexOf("_ga=")===0){var r=/^GA1\.\d{1,3}\.(\d{1,20}\.\d{1,20})$/.exec(k.slice(4));if(r){m=r[1];break}}}var s=null;try{s=window.localStorage}catch(e){}if(m){if(s){try{if(s.getItem(${key})!==m)s.setItem(${key},m)}catch(e){}}}else if(s){var v=null;try{v=s.getItem(${key})}catch(e){}if(v&&/^\d{1,20}\.\d{1,20}$/.test(v))o.client_id=v}}catch(e){}gtag("config",${id},o)})();`;
  return `${BOOTSTRAP}${continuity}`;
}
