import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import admin from "../../../firebase/config-firebase"

// Helper: Extraer datos de Firebase
const extractFirebaseUserData = (firebaseUser: any) => {
  const displayName = firebaseUser.displayName || ""
  const [firstName = "", lastName = ""] = displayName.split(" ")

  return {
    email: firebaseUser.email,
    firstName,
    lastName,
    photoUrl: firebaseUser.photoURL || null,
    phoneNumber: firebaseUser.phoneNumber || null,
    isEmailVerified: firebaseUser.emailVerified || false,
    metadata: {
      createdAt: firebaseUser.metadata?.creationTime,
      lastSignInTime: firebaseUser.metadata?.lastSignInTime
    },
    customClaims: firebaseUser.customClaims || {}
  }
}

// GET: Obtener datos de un cliente específico por ID
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" })
  }

  const token = authHeader.replace("Bearer ", "")

  try {
    // Verificar token de Firebase
    const decodedToken = await admin.auth().verifyIdToken(token)
    const email = decodedToken.email

    if (!email) {
      return res.status(401).json({ error: "No email found in token" })
    }

    // Obtener customer desde Medusa
    const query = req.scope.resolve("query")
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { id }
    })

    const customer = customers?.[0]

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    if (!customer.email) {
      return res.status(400).json({ error: "Customer has no email" })
    }

    // Obtener datos de Firebase por email del customer
    const firebaseUser = await admin.auth().getUserByEmail(customer.email)
    const firebaseData = extractFirebaseUserData(firebaseUser)

    return res.json({
      customer,
      firebaseData
    })
  } catch (err: any) {
    console.error("Error en GET /customer/[id]:", err)
    return res.status(401).json({
      error: "Invalid or expired token",
      details: err.message ?? String(err)
    })
  }
}

// POST/PUT: Actualizar datos del cliente
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  return await updateCustomer(req, res)
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  return await updateCustomer(req, res)
}

const updateCustomer = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const authHeader = req.headers.authorization
  const {
    firstName,
    lastName,
    phoneNumber,
    photoUrl,
    firebaseUid
  } = req.body as {
    firstName?: string
    lastName?: string
    phoneNumber?: string
    photoUrl?: string
    firebaseUid?: string
  }

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" })
  }

  const token = authHeader.replace("Bearer ", "")

  try {
    // Verificar token de Firebase
    const decodedToken = await admin.auth().verifyIdToken(token)
    const email = decodedToken.email

    if (!email) {
      return res.status(401).json({ error: "No email found in token" })
    }

    // Obtener customer desde Medusa
    const query = req.scope.resolve("query")
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { id }
    })

    const customer = customers?.[0]

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    // Validar que el usuario autenticado sea el propietario del customer
    if (customer.email !== email) {
      return res.status(403).json({ error: "Unauthorized to update this customer" })
    }

    // Actualizar datos en Medusa
    const customerModule = req.scope.resolve("customer")
    const updateData: any = {}

    if (firstName) updateData.first_name = firstName
    if (lastName) updateData.last_name = lastName

    const updatedCustomer = await customerModule.updateCustomers(id, updateData)

    // Actualizar datos en Firebase si se proporcionan
    if (firebaseUid && (firstName || lastName || phoneNumber || photoUrl)) {
      const displayName = [firstName || "", lastName || ""].filter(Boolean).join(" ")

      const updateParams: any = {}
      if (displayName) updateParams.displayName = displayName
      if (phoneNumber) updateParams.phoneNumber = phoneNumber
      if (photoUrl !== undefined) updateParams.photoURL = photoUrl

      await admin.auth().updateUser(firebaseUid, updateParams)
    }

    // Obtener datos actualizados de Firebase
    const firebaseUser = await admin.auth().getUserByEmail(customer.email)
    const firebaseData = extractFirebaseUserData(firebaseUser)

    return res.json({
      customer: updatedCustomer,
      firebaseData,
      message: "Customer updated successfully"
    })
  } catch (err: any) {
    console.error("Error en POST/PUT /customer/[id]:", err)
    return res.status(500).json({
      error: "Error updating customer",
      details: err.message ?? String(err)
    })
  }
}