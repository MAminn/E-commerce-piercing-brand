import { PII_QUERY_PARAMS } from "./tracking-url";

/**
 * A blocking inline script for <head>, placed before every tracker tag.
 *
 * It removes PII query parameters (see PII_QUERY_PARAMS) from the address bar
 * with history.replaceState before gtag.js, fbevents.js or Clarity can read
 * `location.href` — those libraries take the page URL from `document.location`
 * themselves, so cleaning the URL inside our own event objects is not enough.
 *
 * On /order-confirmation the email of an old-style link (`?email=`) is moved
 * to sessionStorage under `order_email:<id>` first, so the page can still show
 * it (pages/order-confirmation/order-email.ts reads that key).
 *
 * Plain ES5 on purpose: it is emitted verbatim into the HTML and runs before
 * any bundle. Tested by executing this exact string
 * (shared/utils/__tests__/strip-url-pii-script.test.ts).
 */
export const STRIP_URL_PII_SCRIPT = `(function(){try{var w=window,l=w.location;if(!l||!l.search||!w.history||!w.history.replaceState)return;var pii=${JSON.stringify(
  PII_QUERY_PARAMS,
)};var parts=l.search.replace(/^\\?/,"").split("&"),keep=[],email="",id="",changed=false;for(var i=0;i<parts.length;i++){var p=parts[i];if(!p)continue;var eq=p.indexOf("="),k=eq<0?p:p.slice(0,eq),key;try{key=decodeURIComponent(k.replace(/\\+/g," ")).toLowerCase()}catch(x){key=k.toLowerCase()}var v=eq<0?"":p.slice(eq+1);if(key==="id"){try{id=decodeURIComponent(v.replace(/\\+/g," "))}catch(x){id=v}}if(pii.indexOf(key)>=0){changed=true;if(key==="email"){try{email=decodeURIComponent(v.replace(/\\+/g," "))}catch(x){email=v}}continue}keep.push(p)}if(!changed)return;if(email&&id&&l.pathname==="/order-confirmation"){try{w.sessionStorage.setItem("order_email:"+id,email)}catch(x){}}w.history.replaceState(w.history.state,"",l.pathname+(keep.length?"?"+keep.join("&"):"")+l.hash)}catch(e){}})();`;
