import { handleRequest } from "./handlers";
import type { Env } from "./handlers";

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
