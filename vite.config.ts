import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 環境変数を読み込む
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const isDiscuss = mode === 'discuss'
  const basePath = env.VITE_APP_BASE || (process.env.NODE_ENV === 'production'
    ? (isDiscuss ? '/HomeTeacher/discuss/' : '/HomeTeacher/')
    : '/')
  const appName = env.VITE_APP_NAME || 'TutoTuto'
  const themeColor = env.VITE_THEME_COLOR || '#3498db'

  console.log(`📦 Building ${appName} (mode: ${mode})`)

  // モード別のアイコンディレクトリ
  const iconSource = isDiscuss ? 'public/icons/discuss' : 'public/icons/kids'

  return {
    base: basePath,
    resolve: {
      alias: {
        '@thousands-of-ties/drawing-common': path.resolve(__dirname, '../drawing-common/src')
      }
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
            dest: '',
            rename: 'pdf.worker.min.js'
          },
          // モード別にアイコンをコピー
          {
            src: `${iconSource}/favicon.png`,
            dest: '',
            rename: 'favicon.ico'
          },
          {
            src: `${iconSource}/logo.png`,
            dest: ''
          },
          {
            src: `${iconSource}/app.png`,
            dest: ''
          }
        ]
      }),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'logo.png', 'app.png'],
        manifest: {
          name: appName,
          short_name: appName,
          description: 'AI-powered drill grading app with handwriting support',
          theme_color: themeColor,
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: basePath,
          // start_url: basePath, // URLパラメータ(?premium=true)をショートカットに含めるため、固定のstart_urlを無効化
          icons: [
            {
              src: 'logo.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'app.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                }
              }
            }
          ]
        }
      })
    ],
    server: {
      port: 3000,
      fs: {
        // PDFsフォルダへのアクセスを許可
        allow: ['..']
      }
    },
    optimizeDeps: {
      include: ['pdfjs-dist'],
    },
    assetsInclude: ['**/*.pdf'],
    build: {
      chunkSizeWarningLimit: 1000,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: process.env.NODE_ENV === 'production',
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'fabric-vendor': ['fabric'],
            'pdfjs-vendor': ['pdfjs-dist']
          }
        }
      }
    }
  }
})
