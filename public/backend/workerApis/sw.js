// Service worker nests

importScripts = new Proxy(importScripts, {
	apply(target, that, args) {
		Reflect.apply(...arguments);
	},
});
