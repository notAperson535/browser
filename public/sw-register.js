import { proxyApi } from "./backend/config";
navigator.serviceWorker.register("sw.js", { scope: proxyApi.prefix}).then(function (registration) {
    console.log("Service worker registered");
})

