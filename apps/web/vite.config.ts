import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Inside Docker the API is reachable as http://api:3000; on the host as http://localhost:3000.
const apiUrl = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser only ever talks to the Vite origin; /api is forwarded to the API.
    proxy: { "/api": apiUrl },
  },
});
