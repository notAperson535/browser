import { proxyApi } from "./backend/config.js";
console.log("hi")
navigator.serviceWorker.register("./sw.js", { scope: proxyApi.prefix }).then(function (_registration) {
    console.log("Service worker registered");
})

