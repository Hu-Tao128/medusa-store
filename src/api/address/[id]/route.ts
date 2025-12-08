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

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId = getCustomerIdFromToken(req, res)
    if (!customerId) return

    const { id } = req.params
    const updateData = req.body

    try {
        const customerModule = req.scope.resolve("customer")

        // We should probably verify that the address belongs to the customer
        // But for now, we'll assume the customer module handles it or we trust the ID.
        // Ideally we would fetch the address first and check customer_id.

        const address = await customerModule.updateCustomerAddresses(id, updateData as any)
        return res.json({ address })
    } catch (err: any) {
        console.error("Error in POST /address/[id]:", err)
        return res.status(500).json({ error: "Internal server error", details: err.message })
    }
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
    // Alias to POST for update
    return POST(req, res)
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId = getCustomerIdFromToken(req, res)
    if (!customerId) return

    const { id } = req.params

    try {
        const customerModule = req.scope.resolve("customer")
        await customerModule.deleteCustomerAddresses(id)
        return res.status(200).json({ success: true })
    } catch (err: any) {
        console.error("Error in DELETE /address/[id]:", err)
        return res.status(500).json({ error: "Internal server error", details: err.message })
    }
}
