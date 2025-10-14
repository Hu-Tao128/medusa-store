import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import admin from "../../firebase/config-firebase"

// POST: Registrar usuario con datos de Firebase
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { email, firebaseUid } = req.body as { email?: string; firebaseUid?: string }
    console.log("=== POST /customer ===")
  console.log("Origin:", req.headers.origin)
  console.log("Method:", req.method)
  console.log("Body:", req.body)
  if (!email || !firebaseUid) {
    return res.status(400).json({ error: "Email and firebaseUid are required" })
  }

  try {
    const firebaseUser = await admin.auth().getUser(firebaseUid)
    if (!firebaseUser || firebaseUser.email !== email) {
      return res.status(401).json({ error: "Invalid Firebase user" })
    }

    // En Medusa v2, usa query para buscar y el módulo para crear
    const query = req.scope.resolve("query")
    
    // Busca el customer por email usando el query
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { email }
    })

    let customer
    if (customers && customers.length > 0) {
      customer = customers[0]
    } else {
      // Si no existe, créalo usando el módulo de customer
      const customerModule = req.scope.resolve("customer")
      customer = await customerModule.createCustomers({ email })
    }

    return res.json({ customer })
  } catch (err: any) {
    console.error("Error en POST /customer:", err)
    return res.status(500).json({ 
      error: "Error processing request", 
      details: err.message ?? String(err) 
    })
  }
}

// GET: Obtener usuario autenticado usando el token de Firebase
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" })
  }

  const token = authHeader.replace("Bearer ", "")
  try {
    const decodedToken = await admin.auth().verifyIdToken(token)
    const email = decodedToken.email

    if (!email) {
      return res.status(401).json({ error: "No email found in token" })
    }

    // Usa query para buscar el customer
    const query = req.scope.resolve("query")
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { email }
    })

    const customer = customers?.[0]

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    return res.json({ customer })
  } catch (err: any) {
    console.error("Error en GET /customer:", err)
    return res.status(401).json({ 
      error: "Invalid or expired token",
      details: err.message 
    })
  }
}