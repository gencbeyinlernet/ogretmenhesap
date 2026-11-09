import { createHandler } from "./handler.js";
Deno.serve(createHandler({ env: (key: string) => Deno.env.get(key) }));
