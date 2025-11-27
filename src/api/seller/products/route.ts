import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import SellerService from "../../../modules/seller/service"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    // 1️⃣ Auth Check
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" })
    }

    const token = authHeader.replace("Bearer ", "")
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
        return res.status(500).json({ error: "JWT_SECRET not configured" })
    }

    let customer_id: string
    try {
        const decoded = jwt.verify(token, jwtSecret) as { customer_id: string }
        customer_id = decoded.customer_id
    } catch (err) {
        return res.status(401).json({ error: "Invalid token" })
    }

    // 2️⃣ Seller Check
    const sellerModule = req.scope.resolve("seller") as SellerService
    const sellers = await sellerModule.listSellers({ user_id: customer_id })

    if (sellers.length === 0) {
        return res.status(403).json({ error: "You must be a registered seller to view products" })
    }
    const seller = sellers[0]

    const query = req.scope.resolve("query")

    try {
        // 3. Fetch Linked Products (Metadata approach)
        // We query the 'product' entity directly and filter by metadata.seller_id
        const { data: products } = await query.graph({
            entity: "product",
            fields: [
                "id",
                "title",
                "thumbnail",
                "status",
                "variants.*",
                "variants.prices.*",
                "images.*"
            ],
            filters: {
                metadata: {
                    seller_id: seller.id
                }
            }
        })

        res.json({
            products,
            count: products.length,
            seller_id: seller.id
        })

    } catch (error: any) {
        console.error("Error fetching seller products:", error)
        res.status(500).json({
            error: "Error al obtener productos del vendedor",
            message: error.message ?? String(error)
        })
    }
}
