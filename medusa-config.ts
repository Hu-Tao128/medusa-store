import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },

  // ✅ usa objeto, no array
  modules: {
    customProducts: {
      resolve: "./src/modules/custom-products",
      definition: {
        isQueryable: true,
      },
    },
    seller: {
      resolve: "./src/modules/seller",
    },
    [Modules.FILE]: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              file_url: process.env.S3_FILE_URL,
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              region: process.env.S3_REGION,
              bucket: process.env.S3_BUCKET,
              endpoint: process.env.S3_ENDPOINT,
            },
          },
        ],
      },
    },
    [Modules.PAYMENT]: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          },
          // PayPal configuration (assuming medusa-payment-paypal is compatible or using a different provider)
          // Note: @medusajs/payment-paypal is not currently available in the registry.
          // If you have a compatible provider, add it here.
          // {
          //   resolve: "medusa-payment-paypal",
          //   id: "paypal",
          //   options: {
          //     sandbox: process.env.PAYPAL_SANDBOX === "true",
          //     client_id: process.env.PAYPAL_CLIENT_ID,
          //     client_secret: process.env.PAYPAL_CLIENT_SECRET,
          //     auth_webhook_secret: process.env.PAYPAL_AUTH_WEBHOOK_SECRET,
          //   },
          // },
        ],
      },
    },
  },
})
