import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import admin from "../firebase/config-firebase"

export default async function productUpdatedHandler({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const logger = container.resolve("logger")
    try {
        const query = container.resolve("query")

        // Query Product
        const { data: products } = await query.graph({
            entity: "product",
            fields: ["id", "metadata"],
            filters: { id: data.id },
        })

        const product = products[0]

        if (!product) {
            return logger.warn(`Product not found for id ${data.id}`)
        }

        // Try to get seller_id from metadata
        // metadata is unknown, so we cast or access safely
        const metadata = product.metadata as Record<string, any> | null
        const sellerId = metadata?.seller_id || metadata?.id_seller

        if (!sellerId) {
            return logger.warn(`Product ${product.id} has no metadata.seller_id`)
        }

        // 1. Query Seller to get user_id and store_name
        const { data: sellers } = await query.graph({
            entity: "seller",
            fields: ["user_id", "store_name"],
            filters: { id: sellerId },
        })

        const seller = sellers[0]

        if (!seller) {
            return logger.warn(`Seller not found for id ${sellerId}`)
        }

        const storeName = seller.store_name
        const userId = seller.user_id // This is the Medusa Customer ID

        if (!storeName) {
            return logger.warn(`Seller ${sellerId} has no store_name`)
        }

        // 2. Query Customer to get email
        const { data: customers } = await query.graph({
            entity: "customer",
            fields: ["email"],
            filters: { id: userId },
        })

        const customer = customers[0]

        if (!customer) {
            return logger.warn(`Customer not found for user_id ${userId}`)
        }

        const email = customer.email

        if (!email) {
            return logger.warn(`Customer ${userId} has no email`)
        }

        // 3. Get Firebase UID from email
        const firebaseUser = await admin.auth().getUserByEmail(email)
        const firebaseUid = firebaseUser.uid

        // 4. Sync product data to Firestore
        // We want to store the product data + the owner (firebaseUid)
        // Note: product object here only has id and metadata because of fields selection.
        // If we want full product data, we should select more fields or all fields.
        // Let's fetch more fields for the sync.

        const { data: fullProducts } = await query.graph({
            entity: "product",
            fields: ["*"], // Fetch all fields for sync
            filters: { id: data.id },
        })
        const fullProduct = fullProducts[0]

        const productData = {
            ...fullProduct,
            owner: firebaseUid,
            created_at: fullProduct.created_at instanceof Date ? fullProduct.created_at.toISOString() : fullProduct.created_at,
            updated_at: fullProduct.updated_at instanceof Date ? fullProduct.updated_at.toISOString() : fullProduct.updated_at,
        }

        await admin
            .firestore()
            .doc(`stores/${storeName}/products/${product.id}`)
            .set(productData, { merge: true })

        logger.info(`✅ Synced product ${product.id} to Firestore at stores/${storeName}/products/${product.id} with owner ${firebaseUid}`)
    } catch (err: any) {
        logger.error(`Error in product-updated subscriber: ${err.message}`)
    }
}

export const config: SubscriberConfig = {
    event: "product.updated",
}
