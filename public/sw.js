import handle from "./backend/handle.js";
import dynamicUpdates from "./backend/updates.js";

self.addEventListener("install", event => self.skipWaiting());

self.addEventListener("fetch", async event =>
	event.respondWith(
		handle(event).catch(err => new Response(err.stack, { status: 500 }))
	)
);

dynamicUpdates();