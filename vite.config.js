import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: '/football-lab/' for GitHub Pages project sites (user.github.io/football-lab/).
// Override with BASE_PATH=/ for a custom domain or local preview at root.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/football-lab/",
  plugins: [react()],
});
