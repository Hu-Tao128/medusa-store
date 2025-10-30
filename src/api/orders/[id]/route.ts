import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import jwt from "jsonwebtoken"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: "No token provided" })

  const token = auth.replace("Bearer ", "")
  const jwtSecret = process.env.JWT_SECRET || "supersecret"

  try {
    // Verifica el JWT del cliente
    const decoded: any = jwt.verify(token, jwtSecret)
    const customerId = decoded.customer_id

    // Obtén el order_id de la URL
    const orderId = req.params.id
    if (!orderId) return res.status(400).json({ error: "Order ID is required" })

    const query = req.scope.resolve("query")

    // Trae la orden específica del cliente
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "payment_status",
        "fulfillment_status",
        "total",
        "shipping_total",
        "created_at",
        "items"
      ],
      filters: {
        id: orderId,
        customer_id: customerId
      },
    })

    if (!orders || orders.length === 0) {
      return res.status(404).json({ error: "Order not found" })
    }

    return res.json({ order: orders[0] })
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid token", details: err.message })
  }
}
