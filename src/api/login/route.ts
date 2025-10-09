import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import admin from "../../config/firebase-admin"

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY!
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS) || 9999
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "localhost"
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "Lax"
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { mode, email, password, first_name, last_name } = req.body as {
    mode?: "register" | "login"
    email?: string
    password?: string
    first_name?: string
    last_name?: string
  }

  if (!mode || !email || !password) {
    return res.status(400).json({ message: "Faltan campos requeridos (mode, email, password)" })
  }

  try {
    if (mode === "register") {
      if (!first_name || !last_name) {
        return res.status(400).json({ message: "Faltan campos requeridos para registro" })
      }

      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `${first_name} ${last_name}`,
      })

      const db = admin.firestore()
      await db.collection("users").doc(userRecord.uid).set({
        email,
        first_name,
        last_name,
        role: "customer",
        createdAt: new Date().toISOString(),
      })

      return res.status(201).json({
        message: "Usuario creado correctamente",
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          name: userRecord.displayName,
        },
      })
    }

    // LOGIN
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    )

    const signInData = await signInRes.json()
    if (!signInRes.ok) {
      return res.status(401).json({
        message: "Credenciales inválidas",
        error: signInData.error?.message || "Error desconocido",
      })
    }

    const idToken = signInData.idToken as string
    const uid = signInData.localId as string

    // Sesión prácticamente "infinita"
    const expiresIn = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn })

    const cookie = [
      `session=${sessionCookie}`,
      `Max-Age=${Math.floor(expiresIn / 1000)}`,
      `Path=/`,
      `HttpOnly`,
      `SameSite=${COOKIE_SAMESITE}`,
      `Domain=${COOKIE_DOMAIN}`,
      COOKIE_SECURE ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")

    res.setHeader("Set-Cookie", cookie)

    return res.status(200).json({
      message: "Login realizado correctamente",
      user: { uid, email: signInData.email },
    })
  } catch (error: any) {
    console.error("Error en auth:", error.message)
    return res.status(500).json({
      message: "Error interno del servidor",
      code: error.code || "INTERNAL_ERROR",
    })
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cookies = req.headers.cookie
  if (!cookies) return res.status(401).json({ message: "No autenticado" })

  const sessionCookie = cookies.split(";").find((c) => c.trim().startsWith("session="))?.split("=")[1]
  if (!sessionCookie) return res.status(401).json({ message: "Cookie de sesión no encontrada" })

  try {
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true)
    const user = await admin.auth().getUser(decoded.uid)

    return res.status(200).json({
      message: "Usuario autenticado",
      user: {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
      },
    })
  } catch {
    return res.status(401).json({ message: "Sesión inválida o expirada" })
  }
}
