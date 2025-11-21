import { model } from "@medusajs/framework/utils"

export const Seller = model.define("seller", {
    id: model.id().primaryKey(),
    user_id: model.text().unique(), // Links to the auth identity or customer id
    store_name: model.text().nullable(),
    store_phone: model.text().nullable(),
    store_description: model.text().nullable(),
    store_logo: model.text().nullable(),
    status: model.enum(["pending", "approved", "rejected"]).default("pending"),
})
