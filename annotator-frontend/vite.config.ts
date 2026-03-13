import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import cssInjected from 'vite-plugin-css-injected-by-js'
import glslify from 'rollup-plugin-glslify'
import { fileURLToPath, URL } from 'node:url'
import { replaceNamedImportsFromGlobals } from './vite-plugin-replace-imports'

const filesNeedToExclude = ["src/ts"]
const filesPathToExclude = filesNeedToExclude.map((src) =>
  fileURLToPath(new URL(src, import.meta.url))
)

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build'
  const isPluginBuild = process.env.BUILD_AS_PLUGIN === 'true'
  const isAppBuild = isBuild && !isPluginBuild

  return {
    experimental: isPluginBuild ? {
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === 'js') {
          return {
            runtime: `(function() {
              try {
                if (document.currentScript && document.currentScript.src) {
                  return document.currentScript.src.substring(0, document.currentScript.src.lastIndexOf('/') + 1) + ${JSON.stringify(filename)};
                }
                if (window.__ANNOTATOR_BASE_PATH__) {
                  return window.__ANNOTATOR_BASE_PATH__ + ${JSON.stringify(filename)};
                }
                return ${JSON.stringify('/annotator-frontend/' + filename)};
              } catch (e) {
                return window.__ANNOTATOR_BASE_PATH__ ? (window.__ANNOTATOR_BASE_PATH__ + ${JSON.stringify(filename)}) : ${JSON.stringify('/annotator-frontend/' + filename)};
              }
            })()`
          };
        }
        return { relative: true };
      }
    } : undefined,
    plugins: [
      vue(
        isBuild
          ? {
            template: {
              compilerOptions: {
                isCustomElement: (tag) => tag.startsWith("ion-"),
              },
            },
          }
          : {
            template: {
              transformAssetUrls,
              compilerOptions: {
                isCustomElement: (tag) => tag.startsWith("ion-"),
              },
            },
          }
      ),
      vueJsx(),
      ...(isPluginBuild
        ? [
          cssInjected(),
          replaceNamedImportsFromGlobals({
            pinia: { globalName: 'Pinia', symbols: ["defineStore", "storeToRefs"] },
            vuetify: { globalName: 'Vuetify', symbols: ["useTheme"] },
            'vue-toastification': { globalName: 'VueToastification', symbols: ['useToast', 'TYPE'] },
          }),
        ]
        : [
          vuetify({
            autoImport: true,
            styles: { configFile: "src/styles/settings.scss" },
          }),
        ]),
      glslify({
        include: ["**/*.vs", "**/*.fs", "**/*.vert", "**/*.frag", "**/*.glsl"],
        exclude: "node_modules/**",
        compress: true,
      }),
    ],
    define: {
      "process.env": {
        BASE_URL: "/",
      },
      __IS_PLUGIN__: isPluginBuild,
      // typedarray-pool (used by copper3d-tree) references Node's `global`
      global: 'globalThis',
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        // copper3d-tree dist was built with webpack eval devtool (dev mode),
        // which breaks in Rollup 4.59+ due to aggressive CJS->ESM exports renaming.
        // Point directly to the plain-CJS source file to avoid the issue.
        "copper3d-tree": fileURLToPath(new URL("./node_modules/copper3d-tree/src/kdtree.js", import.meta.url)),
      },
      extensions: [".js", ".json", ".jsx", ".mjs", ".ts", ".tsx", ".vue"],
    },
    base: isPluginBuild ? "" : "/",
    build: isPluginBuild
      ? {
        lib: {
          entry: './src/index.ts',
          name: 'SegmentationApp',
          formats: ['umd'],
          fileName: (format) => `my-app.${format}.js`,
        },
        rollupOptions: {
          external: ['vue', 'vuetify', 'pinia', 'vue-toastification'],
          output: {
            globals: {
              vue: 'Vue',
              vuetify: 'Vuetify',
              pinia: 'Pinia',
              'vue-toastification': 'VueToastification',
            },
          },
        },
      }
      : {
        outDir: "./build",
        rollupOptions: {
          external: [...filesPathToExclude],
        },
      },
    optimizeDeps: isBuild
      ? {}
      : {
        exclude: [
          '@vuetify/loader-shared/runtime',
          'vuetify',
        ],
      },
  }
})
