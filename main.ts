import { serve } from "https://deno.land/std@0.173.0/http/server.ts";
import {serveFile} from "https://deno.land/std@0.173.0/http/file_server.ts";
import { config } from "https://deno.land/std/dotenv/mod.ts";
const configData = await config();

import proxyclass from "./proxyclass.ts";
const proxy = new proxyclass('/fetch', "fetchWs");
async function reqHandler(req: Request){
    const path: string = new URL(req.url).pathname;
   if(proxy.route(req.url)){
      return await proxy.handle(req);
   } else if(proxy.routeWs(req.url)){
        return await proxy.handleWs(req);
    } else {
        return serveFile(req, path === "/" ? "./public/index.html" : "public" + path)
    }

}

await serve(await reqHandler, {port: Number(Deno.env.get("PORT")) || Number(configData["PORT"]) || 8080})
