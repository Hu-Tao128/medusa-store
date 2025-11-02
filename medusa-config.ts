import { loadEnv, defineConfig } from "@medusajs/framework/utils"

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
  //@ts-ignore
  modulesConfig: {
    file: {
      resolve: "@medusajs/file",
      options: {
        default_provider: "s3", // 👈 IMPORTANTE
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
    
    // CONFIGURACIÓN CORRECTA DE STRIPE
    stripe_payment: {
      resolve: "@medusajs/payment-stripe",
      options: {
        api_key: process.env.STRIPE_API_KEY,
        webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
      },
    },
    
    // CONFIGURACIÓN CORRECTA DE PAYPAL
    paypal_payment: {
      resolve: "@medusajs/payment-paypal",
      options: {
        sandbox: process.env.PAYPAL_SANDBOX === "true",
        client_id: process.env.PAYPAL_CLIENT_ID,
        client_secret: process.env.PAYPAL_CLIENT_SECRET,
        auth_webhook_secret: process.env.PAYPAL_AUTH_WEBHOOK_SECRET,
      },
    },
  },
})