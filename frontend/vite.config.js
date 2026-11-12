import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "^/(upload-audio|process|meetings|ask|audio)(/|$)": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { vendor: ["react", "react-dom", "react-router-dom", "axios"] } },
    },
  },
});
