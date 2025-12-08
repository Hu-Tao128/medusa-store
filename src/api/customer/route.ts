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
    } else {
      const customerModule = req.scope.resolve("customer")
      customer = await customerModule.createCustomers({
        email,
        first_name: firstName,
        last_name: lastName
      })
    }

    // ⬇️ NUEVO: Sincronizar datos de Firestore (Roles, Seller y Address)
    try {
      const firestore = admin.firestore()
      const userDoc = await firestore.collection("users").doc(firebaseUid).get()

      if (userDoc.exists) {
        const userData = userDoc.data()
        const role = userData?.role

        console.log("Firestore User Data:", userData)

        // --- SYNC PROFILE (Name & Phone) ---
        const firestoreName = userData?.name || ""
        const firestorePhone = userData?.phoneNumber || ""

        let targetFirstName = firstName
        let targetLastName = lastName

        if (firestoreName) {
          const parts = firestoreName.split(" ")
          targetFirstName = parts[0]
          targetLastName = parts.slice(1).join(" ")
        }

        const customerModule = req.scope.resolve("customer")

        // Check if we need to update basic info
        if (
          (targetFirstName && customer.first_name !== targetFirstName) ||
          (targetLastName && customer.last_name !== targetLastName) ||
          (firestorePhone && customer.phone !== firestorePhone)
        ) {
          console.log("Syncing Profile: Firestore -> Medusa")
          customer = await customerModule.updateCustomers(customer.id, {
            first_name: targetFirstName,
            last_name: targetLastName,
            phone: firestorePhone
          })
          console.log("✅ Customer profile updated from Firestore")
        }

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

        // --- SYNC ADDRESS ---
        const firebaseAddress = userData?.address
        // Re-fetch customer with addresses to be sure
        const { data: customerWithAddresses } = await query.graph({
          entity: "customer",
          fields: ["id", "addresses.*"],
          filters: { id: customer.id }
        })
        const medusaAddresses = customerWithAddresses[0]?.addresses || []

        // 1. Firebase -> Medusa
        if (firebaseAddress && medusaAddresses.length === 0) {
          console.log("Syncing Address: Firebase -> Medusa")
          const customerModule = req.scope.resolve("customer")

          await customerModule.createCustomerAddresses({
            customer_id: customer.id,
            first_name: firstName,
            last_name: lastName,
            phone: userData?.phoneNumber || "",
            address_1: firebaseAddress.street || "",
            city: firebaseAddress.city || "",
            province: firebaseAddress.state || "", // Mapping state to province directly as requested
            country_code: "mx", // Defaulting to mx as per request if country is "México"
            postal_code: firebaseAddress.zipCode || "",
            metadata: {
              source: "firebase_sync"
            }
          })
          console.log("✅ Address created in Medusa from Firebase")
        }
        // 2. Medusa -> Firebase
        else if (!firebaseAddress && medusaAddresses.length > 0) {
          console.log("Syncing Address: Medusa -> Firebase")
          const medusaAddr = medusaAddresses[0] // Sync the first one

          const newFirebaseAddress = {
            street: medusaAddr.address_1 || "",
            city: medusaAddr.city || "",
            state: medusaAddr.province || "",
            country: "México", // Defaulting back
            zipCode: medusaAddr.postal_code || ""
          }

          await firestore.collection("users").doc(firebaseUid).update({
            address: newFirebaseAddress
          })
          console.log("✅ Address created in Firebase from Medusa")
        }
      }
    } catch (firestoreError) {
      console.error("Error syncing with Firestore:", firestoreError)
      // No fallamos el request principal si falla la sync de firestore, pero lo logueamos
    }

    // ⬇️ NUEVO: Generar token JWT de Medusa
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is missing in environment variables")
      return res.status(500).json({ error: "JWT_SECRET not configured" })
    }
    console.log("🔑 JWT_SECRET is configured (length):", jwtSecret.length)

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
    console.log("🎫 Generated Token (first 10 chars):", medusaToken.substring(0, 10) + "...")

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
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is missing in environment variables")
      return res.status(500).json({ error: "JWT_SECRET not configured" })
    }
    console.log("🔑 JWT_SECRET is configured (length):", jwtSecret.length)
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