import createServer from '@tomphttp/bare-server-node';
import http from 'http';
import nodeStatic from 'node-static';


const bare =  createServer('/bare/');
const serve = new nodeStatic.Server('/public/');

const server = http.createServer();

server.on('request', (req, res) => {
    if (bare.shouldRoute(req)) {
		bare.routeRequest(req, res);
	} else {
		serve.serve(req, res);
	}
});

server.on('upgrade', (req, socket, head) => {
	if (bare.shouldRoute(req, socket, head)) {
		bare.routeUpgrade(req, socket, head);
	}else{
		socket.end();
	}
});

server.listen({
	port: process.env.PORT || 8080,
});















export default class {
	prefix = "";
	wsPrefix = "";
	debug = true;

	constructor(prefix, wsPrefix, debug) {
		this.prefix = prefix;
		this.wsPrefix = wsPrefix;
		this.debug = debug ?? false;
	}
	route(path) {
		return path === this.prefix;
	}
	routeWs(path) {
		return path.startsWith(this.wsPrefix);
	}
	async handle(req) {
		const url = req.headers.get("x-url") || "";

		// deno-lint-ignore ban-types
		const headers = JSON.parse(req.headers.get("x-headers") || "");

		if (this.debug) console.log(`Handling ${url}`);

		try {
			const opts = {
				method: req.method,
				headers: headers,
			};

			if (opts.method === "POST") {
				opts.body = await req.text();

				console.log(`${req.method} ${url}`);
			}

			const proxyResp = await fetch(url, opts);

			const respHeaders = Object.fromEntries(proxyResp.headers.entries());

			// Don't cache
			delete respHeaders["age"];
			delete respHeaders["cache-control"];
			delete respHeaders["expires"];

			return new Response(await proxyResp.body, {
				status: proxyResp.status,
				headers: {
					"cache-control": "no-cache",
					...respHeaders,
				},
			});
		} catch (err) {
			return new Response(err.message, { status: 500 });
		}
	}
	handleWs(req) {
		let resp, sock = nul;

		const proto = req.headers.get("sec-websocket-protocol") || "";

		try {
			({ response: resp, socket: sock } = Deno.upgradeWebSocket(req, {
				protocol: proto,
			}));
		} catch {
			return new Response("Not a WS connection");
		}

		const url = new URL(req.url).searchParams.get("url") || "";

		if (this.debug) console.log(`Handling WS ${url}`);

		const proxySock = new WebSocket(url, proto);

		sock.onmessage = e => proxySock.send(e.data);
		proxySock.onmessage = e => sock.send(e.data);

		sock.onclose = () => proxySock.close();
		proxySock.onclose = () => sock.close();

		return resp;
	}
}