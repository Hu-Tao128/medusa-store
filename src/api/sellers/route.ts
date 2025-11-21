import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SELLER_MODULE } from "../../modules/seller"
import SellerService from "../../modules/seller/service"
import jwt from "jsonwebtoken"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" })
    }

    const token = authHeader.replace("Bearer ", "")
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
        return res.status(500).json({ error: "JWT_SECRET not configured" })
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, jwtSecret) as { customer_id: string; email: string }

        if (!decoded.customer_id) {
            return res.status(401).json({ error: "Invalid token payload: missing customer_id" })
        }

        const sellerModule: SellerService = req.scope.resolve(SELLER_MODULE)

        // Check if seller already exists for this user
        const existingSellers = await sellerModule.listSellers({
            user_id: decoded.customer_id,
        })

        if (existingSellers.length > 0) {
            return res.status(409).json({
                error: "User is already a seller",
                seller: existingSellers[0]
            })
        }

        // Create new seller
        const { store_name } = req.body as { store_name?: string }

        const newSeller = await sellerModule.createSellers({
            user_id: decoded.customer_id,
            store_name: store_name || `Store of ${decoded.email}`,
            status: "pending",
        })

        return res.json({
            message: "Seller account created successfully",
            seller: newSeller,
        })

    } catch (err: any) {
        console.error("Error in POST /sellers:", err)
        return res.status(401).json({
            error: "Invalid or expired token",
            details: err.message
        })
    }
}
