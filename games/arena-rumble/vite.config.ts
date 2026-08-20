import { defineConfig } from 'vite';

/**
 * The game is published to https://damiandomenik.github.io/games/arenarumble
 * so every emitted URL has to be prefixed with that sub path.
 * Nothing in the codebase may rely on the site living at "/".
 */
export default defineConfig({
  base: '/games/arena-rumble/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-mesh-bvh'],
          net: ['peerjs'],
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
