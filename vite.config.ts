import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to copy static files to dist
function copyStaticFiles(): Plugin {
  const staticFiles = [
    'manifest.json',
    'devtools.html',
    'src/panel/panel.html',
    'src/panel/panel.css',
  ];

  return {
    name: 'copy-static-files',
    buildStart() {
      for (const file of staticFiles) {
        this.addWatchFile(resolve(__dirname, file));
      }
    },
    writeBundle() {
      // Ensure dist directories exist
      if (!existsSync('dist')) {
        mkdirSync('dist', { recursive: true });
      }
      if (!existsSync('dist/panel')) {
        mkdirSync('dist/panel', { recursive: true });
      }

      // Copy manifest and devtools.html
      copyFileSync('manifest.json', 'dist/manifest.json');
      copyFileSync('devtools.html', 'dist/devtools.html');

      // Copy panel HTML and CSS
      copyFileSync('src/panel/panel.html', 'dist/panel/index.html');
      copyFileSync('src/panel/panel.css', 'dist/panel/panel.css');
    }
  };
}

// Bundle content.ts into a standalone file with all imports inlined.
// content.js is injected via chrome.scripting.executeScript as a classic script,
// where import/export statements are syntax errors. This plugin re-bundles it
// via esbuild after the main Rollup build, producing a single self-contained file.
function bundleContentScript() {
  return {
    name: 'bundle-content-script',
    async writeBundle() {
      const { build } = await import('esbuild');
      await build({
        entryPoints: [resolve(__dirname, 'src/content.ts')],
        bundle: true,
        outfile: resolve(__dirname, 'dist/content.js'),
        format: 'esm',
        target: 'es2020',
        minify: false,
      });
    }
  };
}

// Virtual module that returns the current git branch on each request (dev only)
function gitBranchPlugin(): Plugin {
  const virtualId = 'virtual:git-branch';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'git-branch',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        try {
          const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
          return `export default ${JSON.stringify(branch)};`;
        } catch {
          return `export default "";`;
        }
      }
    },
    handleHotUpdate({ file, server }) {
      // When HEAD changes (branch switch), invalidate the virtual module
      if (file.endsWith('.git/HEAD') || file.endsWith('HEAD')) {
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          return [mod];
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), copyStaticFiles(), bundleContentScript(), gitBranchPlugin()],

  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        // Panel scripts
        'panel/panel': resolve(__dirname, 'src/panel/panel.tsx'),
        'panel/field-info': resolve(__dirname, 'src/panel/field-info.ts'),
        // Standalone scripts
        'background': resolve(__dirname, 'src/background.ts'),
        'content': resolve(__dirname, 'src/content.ts'),
        'devtools': resolve(__dirname, 'src/devtools.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        // ES modules format - Chrome extensions support this
        format: 'es',
      },
    },
    // Don't minify for easier debugging during development
    minify: mode === 'production',
    sourcemap: mode !== 'production',
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },

  // Dev server configuration
  server: {
    port: 5173,
    strictPort: true,
  },
}));
