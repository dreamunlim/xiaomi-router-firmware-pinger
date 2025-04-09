self.addEventListener("install", (event) => {
    console.log("SW installation");
    self.skipWaiting(); // activate worker right after installation
});

self.addEventListener("activate", (event) => {
    console.log("SW activation");
    event.waitUntil(clients.claim()); // start intercepting without page reload
});

const proxyResponse = (orig) => orig.status<400 ? orig : new Response(null, {
    status: 202,
    statusText: "Accepted",
    headers: new Headers({
        "Status": orig.status,
        "StatusText": orig.statusText
    })
});

self.addEventListener("fetch", (event) => event.respondWith(
    fetch(event.request).then(proxyResponse)
));