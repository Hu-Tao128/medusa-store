import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || ""

const getCustomerIdFromToken = (req: MedusaRequest, res: MedusaResponse): string | null => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        res.status(401).json({ error: "No authorization header" })
        return null
    }
    const token = authHeader.replace("Bearer ", "")
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { customer_id: string }
        return decoded.customer_id
    } catch (err) {
        res.status(401).json({ error: "Invalid token" })
        return null
    }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId = getCustomerIdFromToken(req, res)
    if (!customerId) return

    try {
        const query = req.scope.resolve("query")
        const { data: customers } = await query.graph({
            entity: "customer",
            fields: ["id", "addresses.*"],
            filters: { id: customerId }
        })

        const customer = customers[0]
        if (!customer) {
            return res.status(404).json({ error: "Customer not found" })
        }

        return res.json({ addresses: customer.addresses })
    } catch (err: any) {
        console.error("Error in GET /address:", err)
        return res.status(500).json({ error: "Internal server error", details: err.message })
    }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId = getCustomerIdFromToken(req, res)
    if (!customerId) return

    const addressData = req.body

    try {
        const customerModule = req.scope.resolve("customer")

        const address = await customerModule.createCustomerAddresses({
            customer_id: customerId,
            ...addressData as any
        })

        return res.json({ address })
    } catch (err: any) {
        console.error("Error in POST /address:", err)
        return res.status(500).json({ error: "Internal server error", details: err.message })
    }
}
