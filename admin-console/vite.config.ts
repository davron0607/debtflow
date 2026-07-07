// @lovable.dev/vite-tanstack-config уже включает: tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, nitro (node-server), VITE_* инъекцию, @-алиас.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: { preset: "node-server" },
});
