// src/api/store/orders/by-customer/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import jwt from "jsonwebtoken"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: "No token provided" })

  const token = auth.replace("Bearer ", "")
  const jwtSecret = process.env.JWT_SECRET || "supersecret"

  try {
    const decoded: any = jwt.verify(token, jwtSecret)
    const customerId = decoded.customer_id

    const query = req.scope.resolve("query")
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status", "total", "created_at"],
      filters: { customer_id: customerId },
      order: { created_at: "DESC" }
    })

    return res.json({ orders })
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid token", details: err.message })
  }
}
