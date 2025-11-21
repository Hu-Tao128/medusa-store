import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import admin from "../../firebase/config-firebase"
import jwt from "jsonwebtoken" // ⬅️ Necesitarás instalar: npm install jsonwebtoken

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

    const displayName = firebaseUser.displayName || ""
    const [firstName = "", lastName = ""] = displayName.split(" ")

    const query = req.scope.resolve("query")

    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { email }
    })

    let customer

    if (customers && customers.length > 0) {
      customer = customers[0]

      if (!customer.first_name && firstName) {
        const customerModule = req.scope.resolve("customer")
        customer = await customerModule.updateCustomers(customer.id, {
          first_name: firstName,
          last_name: lastName
        })
      }
    } else {
      const customerModule = req.scope.resolve("customer")
      customer = await customerModule.createCustomers({
        email,
        first_name: firstName,
        last_name: lastName
      })
    }

    // ⬇️ NUEVO: Sincronizar datos de Firestore (Roles y Seller)
    try {
      const firestore = admin.firestore()
      const userDoc = await firestore.collection("users").doc(firebaseUid).get()

      if (userDoc.exists) {
        const userData = userDoc.data()
        const role = userData?.role

        console.log("Firestore User Data:", userData)

        if (role === "seller") {
          const sellerModule = req.scope.resolve("seller")

          // Buscar si ya existe un seller para este usuario
          const sellers = await sellerModule.listSellers({
            user_id: customer.id
          })

          const sellerData = {
            store_name: userData?.storeName || "",
            store_phone: userData?.storePhone || "",
            store_description: userData?.storeDescription || "",
            store_logo: userData?.storeLogo || "", // Asumiendo que esto viene del frontend/firebase si existiera
            status: "approved" as const // O el estado que corresponda
          }

          if (sellers.length > 0) {
            // Actualizar seller existente
            await sellerModule.updateSellers({
              id: sellers[0].id,
              ...sellerData
            })
            console.log("✅ Seller actualizado:", sellers[0].id)
          } else {
            // Crear nuevo seller
            await sellerModule.createSellers({
              user_id: customer.id,
              ...sellerData
            })
            console.log("✅ Nuevo Seller creado para:", customer.id)
          }
        }
      }
    } catch (firestoreError) {
      console.error("Error syncing with Firestore:", firestoreError)
      // No fallamos el request principal si falla la sync de firestore, pero lo logueamos
    }

    // ⬇️ NUEVO: Generar token JWT de Medusa
    const jwtSecret = process.env.JWT_SECRET || "supersecret"
    const medusaToken = jwt.sign(
      {
        customer_id: customer.id,
        email: customer.email,
        type: "customer"
      },
      jwtSecret,
      { expiresIn: "30d" }
    )

    console.log("✅ Customer sincronizado y token generado:", customer.id)

    return res.json({
      customer,
      medusaToken // ⬅️ Devolver el token
    })

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

    // ⬇️ NUEVO: Generar token JWT de Medusa también en GET
    const jwtSecret = process.env.JWT_SECRET || "supersecret"
    const medusaToken = jwt.sign(
      {
        customer_id: customer.id,
        email: customer.email,
        type: "customer"
      },
      jwtSecret,
      { expiresIn: "30d" }
    )

    return res.json({
      customer,
      medusaToken // ⬅️ Devolver el token
    })

  } catch (err: any) {
    console.error("Error en GET /customer:", err)
    return res.status(401).json({
      error: "Invalid or expired token",
      details: err.message
    })
  }
}