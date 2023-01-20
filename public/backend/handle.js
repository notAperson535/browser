// Routes
import routes from "./routes.js";

// Dynamic Config
import getConfig from "./util/getConfig.js";

// Utility
import ProxyFetch from "./util/ProxyFetch.js";
import handleSharedModule from "./util/handleSharedModule.js";
import getRequestUrl from "./util/getRequestUrl.js";
import headersToObject from "./util/headersToObject.js";
import unwrapImports from "./util/unwrapImports.js";

// Cors Emulation
import block from "./util/corsTest.js";

// Rewriters
import rewriteReqHeaders from "./rewriters/worker/reqHeaders.js";
import rewriteRespHeaders from "./rewriters/worker/respHeaders.js";
import rewriteManifest from "./rewriters/worker/manifest.js";
import scope from "./rewriters/shared/scope.js";

/**
 * Handles the requests
 * @param {FetchEvent} - The event
 * @param {Location} - The window location
 * @returns {Response} - The proxified response
 */
async function handle(event) {
	// Dynamic config
	const { aeroPrefix, proxyApi, proxyApiWs, prefix, debug, flags } =
		getConfig();

	// Separate the prefix from the url to get the proxy url isolated
	const afterPrefix = new RegExp(`^(${self.location.origin}${prefix})`, "g");

	// Construct proxy fetch instance
	const proxyFetch = new ProxyFetch(self.location.origin + proxyApi);

	const reqUrl = new URL(event.request.url);

	const path = reqUrl.pathname + reqUrl.search;

	// Remove the module components
	if (
		path.startsWith(aeroPrefix + "rewriters/shared/") &&
		path.endsWith(".js")
	)
		return await handleSharedModule(event);
	// Don't rewrite requests for aero library files
	if (path.startsWith(aeroPrefix))
		// Proceed with the request like normal
		return await fetch(event.request.url);

	var proxyUrl;
	// Get the origin from the user's window
	if (event.clientId !== "") {
		// Get the current window
		const win = await clients.get(event.clientId);

		// Get the url after the prefix
		proxyUrl = new URL(win.url.replace(afterPrefix, ""));
	}

	// Determine if the request was made to load the homepage; this is needed so that the proxy will know when to rewrite the html files (for example, you wouldn't want it to rewrite a fetch request)
	const homepage =
		event.request.mode === "navigate" &&
		event.request.destination === "document";
	// This is used for determining the request url and
	const iFrame = event.request.destination === "iframe";

	// Parse the request url to get the url to proxy
	const url = getRequestUrl(
		reqUrl.origin,
		self.location.origin,
		proxyUrl,
		path,
		homepage,
		iFrame
	);

	// Ensure the request isn't blocked by CORS
	if (await block(url.href))
		return new Response("Blocked by CORS", { status: 500 });

	// Log requests
	if (debug.url)
		console.log(
			event.request.destination == ""
				? `${event.request.method} ${url}`
				: `${event.request.method} ${url} (${event.request.destination})`
		);

	// Rewrite the request headers
	const reqHeaders = headersToObject(event.request.headers);
	const rewrittenReqHeaders = rewriteReqHeaders(
		reqHeaders,
		proxyUrl,
		afterPrefix
	);

	let opts = {
		method: event.request.method,
		headers: rewrittenReqHeaders,
	};

	// A request body should only be created under a post request
	if (event.request.method === "POST") opts.body = await event.request.text();

	// Make the request to the proxy
	const resp = await proxyFetch.fetch(url, opts);

	// Rewrite the response headers
	const respHeaders = headersToObject(resp.headers);
	const rewrittenRespHeaders = rewriteRespHeaders(respHeaders);

	const type = respHeaders["content-type"];

	const html =
		// Not all sites respond with a type
		typeof type === "undefined" || type.startsWith("text/html");

	// Rewrite the body
	let body;
	const noModuleSupportMsg = "No nest support for service worker";
	if ((homepage || iFrame) && html) {
		body = await resp.text();

		if (body !== "") {
			body = `
			<!DOCTYPE html>
			<head>
				<!-- Fix encoding issue -->
				<meta charset="utf-8">
				
				<!-- Favicon -->
				<!--
				Delete favicon if /favicon.ico isn't found
				This is needed because the browser will cache the favicon from the previous site
				-->
				<link href="data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQEAYAAABPYyMiAAAABmJLR0T///////8JWPfcAAAACXBIWXMAAABIAAAASABGyWs+AAAAF0lEQVRIx2NgGAWjYBSMglEwCkbBSAcACBAAAeaR9cIAAAAASUVORK5CYII=" rel="icon" type="image/x-icon">
				<!-- If not defined already, manually set the favicon -->
				<link href="${prefix + url.origin}/favicon.ico" rel="icon" type="image/x-icon">
				
				<script>
					// Update the service worker
					navigator.serviceWorker
						.register("/sw.js", {
							scope: ${prefix},
							// Don't cache http requests
							updateViaCache: "none",
							type: "module",
						})
						// Update service worker
						.then(reg => reg.update())
						.catch(err => console.error(err.message));

					// Aero's global namespace
					var $aero = {
						config: {
							aeroPrefix: ${aeroPrefix},
							prefix: "${prefix}",
							proxyApiWs: "${proxyApiWs}",
							debug: ${JSON.stringify(debug)},
							flags: ${JSON.stringify(flags)},
						}
					};

					$aero.afterPrefix = new RegExp(\`^(\${location.origin}\${$aero.config.prefix})\`, "g");
				</script>

				<!-- Injected Aero code -->
				${unwrapImports(routes)}
				<script>
					// This is used to later copy into an iFrame's srcdoc; this is an edge case
					$aero.imports = \`${unwrapImports(routes, true)}\`;
				</script>
				</head>
				
				${body}
			`;
		}
	} else if (event.request.destination === "script")
		// Scope the scripts
		body = scope(await resp.text());
	else if (event.request.destination === "manifest")
		body = rewriteManifest(await resp.text());
	// Nests
	else if (flags.nestedWorkers && event.request.destination === "worker")
		body = `
if (typeof module !== "undefined")
	importScripts("${aeroPrefix}nest/worker.js");
else
	console.warn("${noModuleSupportMsg}");

${body}
`;
	else if (
		flags.nestedWorkers &&
		event.request.destination === "sharedworker"
	)
		body = `
if (typeof module !== "undefined") {
	importScripts("${aeroPrefix}workerApis/worker.js");
	importScripts("${aeroPrefix}workerApis/sharedworker.js");
} else
	console.warn("${noModuleSupportMsg}");
	
${body}
`;
	else if (
		flags.nestedWorkers &&
		event.request.destination === "serviceworker"
	)
		body = `
if (typeof module !== "undefined") {
	importScripts("${aeroPrefix}workerApis/worker.js");
	importScripts("${aeroPrefix}workerApis/sw.js");
} else
	console.warn("${noModuleSupportMsg}");

${body}
		`;
	// No rewrites are needed; proceed as normal
	else body = resp.body;

	// Return the response
	return new Response(body, {
		status: resp.status ? resp.status : 200,
		headers: rewrittenRespHeaders,
	});
}

export default handle;
