import handle from "./backend/handle.js";
import dynamicUpdates from "./backend/updates.js";

self.addEventListener("install", _event => self.skipWaiting());

self.addEventListener("fetch", event =>
	event.respondWith(
		handle(event).catch(err => new Response(err.stack, { status: 500 }))
	)
);

dynamicUpdates();