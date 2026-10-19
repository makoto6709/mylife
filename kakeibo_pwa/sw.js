'use strict';
const CACHE='kakeibo-v4.1.3';
const ASSETS=['./','./index.html','./style.css?v=4.1.3','./app.js?v=4.1.3','./receipt.js?v=4.1.3','./manifest.webmanifest','./icon.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Wait for existing windows to close before switching versions; never erase other MyLife caches.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('kakeibo-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{const cached=await caches.match(event.request,{cacheName:CACHE});return cached||Response.error();}));
});
