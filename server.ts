import "./load-env.ts";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import apiRoutes from "./src/server/routes/index.ts";
import { initDatabase } from "./src/server/lib/db.ts";

function listenWithFallback(
  app: ReturnType<typeof express>,
  startPort: number,
  host: string,
  maxAttempts = 10
): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;

    const tryListen = () => {
      const server = app.listen(port, host, () => resolve(port));
      server.on("error", (err: any) => {
        if (err?.code === "EADDRINUSE" && attempts < maxAttempts) {
          attempts += 1;
          port += 1;
          tryListen();
          return;
        }
        reject(err);
      });
    };

    tryListen();
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), "public")));
  app.use("/api", apiRoutes);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    // Ensure we don't start Vite's HMR WebSocket server (keeps local dev to a single port).
    process.env.DISABLE_HMR = "true";
    const vite = await createViteServer({
      // Disable HMR WS server so we only use one local port (the Express port).
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        // Accept requests from tunneling hosts (ngrok, etc.) and LAN clients.
        allowedHosts: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  try {
    await initDatabase();
  } catch (err) {
    console.error("[db] Failed to initialize database:", err);
    process.exit(1);
  }

  try {
    const boundPort = await listenWithFallback(app, PORT, "0.0.0.0");
    console.log(`Server running on http://localhost:${boundPort}`);
  } catch (err) {
    console.error("[server] Failed to start:", err);
    process.exit(1);
  }
}

startServer();
