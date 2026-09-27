import { createServer } from "node:http";
const server = createServer((_request, response) => response.end("ready"));
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`Local: http://127.0.0.1:${server.address().port}/\n`);
});
process.once("SIGTERM", () => server.close(() => process.exit(0)));
process.once("SIGINT", () => server.close(() => process.exit(0)));
