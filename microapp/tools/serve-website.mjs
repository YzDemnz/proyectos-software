import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../website", import.meta.url)));
const port = Number(process.env.MICROAPP_WEBSITE_PORT || 8082);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const requested = pathname === "/" ? "/index.html" : pathname;
    const filePath = resolve(root, `.${requested}`);

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Acceso denegado");
      return;
    }

    const file = await stat(filePath);
    if (!file.isFile()) {
      response.writeHead(404).end("No encontrado");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": file.size,
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("No encontrado");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sitio de MicroApp disponible en http://127.0.0.1:${port}`);
});
