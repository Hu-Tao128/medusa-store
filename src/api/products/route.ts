import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IProductModuleService, IPricingModuleService, IFulfillmentModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import SellerService from "../../modules/seller/service"
import { createSellerProductWorkflow } from "../../workflows/create-seller-product"

function normalizePriceObject(price: any) {
  const original = typeof price?.amount === "number" ? price.amount : Number(price?.amount ?? 0)

  let amount_cents: number
  let amount_units: number

  if (Number.isInteger(original) && original > 1000) {

    amount_cents = original
    amount_units = +(original / 100).toFixed(2)
  } else {

    amount_cents = Math.round(original * 100)
    amount_units = +(amount_cents / 100).toFixed(2)
  }

  return {
    ...price,
    amount_raw: original,
    amount_cents,
    amount_units,
    amount: amount_cents,
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  try {
    // Obtener productos con variantes, precios e inventario (location_levels)
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "subtitle",
        "description",
        "is_giftcard",
        "status",
        "thumbnail",
        "weight",
        "length",
        "height",
        "width",
        "origin_country",
        "hs_code",
        "mid_code",
        "material",
        "metadata",
        "created_at",
        "updated_at",
        "images.*",
        "variants.*",
        "variants.prices.*",
        // campos añadidos para inventario
        "variants.inventory_items.*",
        "variants.inventory_items.inventory.*",
        "variants.inventory_items.inventory.location_levels.*",
        "categories.*",
      ],
      filters: {
        status: ["published"],
      },
    })

    // helper para extraer cantidad desde un location_level u otros campos comunes
    const qtyFromLevelValue = (lvl: any) =>
      Number(lvl?.stocked_quantity ?? lvl?.quantity ?? lvl?.available ?? lvl?.available_quantity ?? lvl?.qty ?? 0)

    // Formatear la respuesta para que sea más fácil de usar en el frontend
    const formattedProducts = products.map(product => ({
      ...product,
      variants: product.variants?.map((variant: any) => {
        // normalizar inventory_items -> extraer location_levels y calcular total por inventory_item
        const inventory_items = (variant.inventory_items || []).map((pv: any) => {
          const inv = pv.inventory || {}

          // location_levels puede venir en inventory.location_levels o directamente en pv.location_levels
          const location_levels = inv.location_levels || pv.location_levels || []

          const total_by_item = (location_levels || []).reduce((sum: number, lvl: any) => {
            return sum + qtyFromLevelValue(lvl)
          }, 0)

          // fallback: si inventory tiene un campo directo de cantidad
          const fallbackQty = Number(inv?.quantity ?? pv?.quantity ?? 0)

          return {
            ...pv,
            inventory: {
              ...inv,
              location_levels: location_levels,
            },
            total_quantity: total_by_item || fallbackQty,
          }
        })

        const total_variant_quantity = inventory_items.reduce((s: number, it: any) => s + Number(it.total_quantity || 0), 0)

        const in_stock = total_variant_quantity > 0

        return {
          ...variant,
          price_set: {
            prices: (variant.price_set?.prices || variant.prices || []).map((p: any) =>
              normalizePriceObject(p)
            ),
          },
          prices: (variant.prices || []).map((p: any) => normalizePriceObject(p)),
          inventory_items,
          total_quantity: total_variant_quantity,
          // bandera que el front puede usar para mostrar gris/inactivo
          is_active: in_stock,
          in_stock,
        }
      })
    }))

    res.json({
      products: formattedProducts,
      count: formattedProducts.length,
    })
  } catch (error: any) {
    console.error("Error fetching products:", error)
    res.status(500).json({
      error: "Error al obtener productos",
      message: error.message ?? String(error)
    })
  }
}

type ProductVariantBody = {
  title: string
  price: number
  quantity?: number
}

type CreateProductBody = {
  title: string
  description?: string
  thumbnail?: string
  images?: string[]
  collection_id?: string
  category_ids?: string[]
  variants: ProductVariantBody[]
}

export async function POST(req: MedusaRequest<CreateProductBody>, res: MedusaResponse) {
  // 1️⃣ Auth Check
  const authHeader = req.headers.authorization
  if (!authHeader) {
    console.warn("⚠️ No authorization header received in POST /products")
    return res.status(401).json({ error: "No authorization header" })
  }
  console.log("📨 Received Authorization Header:", authHeader.substring(0, 20) + "...")

  const token = authHeader.replace("Bearer ", "")
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT_SECRET not configured" })
  }

  let customer_id: string

  try {
    const decoded = jwt.verify(token, jwtSecret) as { customer_id: string }
    customer_id = decoded.customer_id
    console.log("✅ Token verified for customer:", customer_id)
  } catch (err: any) {
    console.error("❌ Token verification failed:", err.message)
    if (token.startsWith("sk_")) {
      console.warn("🚨 WARNING: It looks like an API Key (sk_...) was sent instead of a JWT!")
    }
    return res.status(401).json({ error: "Invalid token", details: err.message })
  }

  // 2️⃣ Seller Check
  const sellerModule = req.scope.resolve("seller") as SellerService
  const sellers = await sellerModule.listSellers({ user_id: customer_id })

  if (sellers.length === 0) {
    return res.status(403).json({ error: "You must be a registered seller to create products" })
  }

  const seller = sellers[0]

  try {
    const { title, description, thumbnail, images, variants, collection_id, category_ids } = req.body

    if (!title || !variants || !variants.length) {
      return res.status(400).json({
        error: "Datos incompletos",
        message: "El título y al menos una variante son requeridos."
      })
    }

    // 3️⃣ Execute Workflow
    // Fetch default shipping profile
    const fulfillmentService: IFulfillmentModuleService = req.scope.resolve(Modules.FULFILLMENT)
    const shippingProfiles = await fulfillmentService.listShippingProfiles({}, { take: 1 })
    const shippingProfileId = shippingProfiles[0]?.id

    const { result: product } = await createSellerProductWorkflow(req.scope).run({
      input: {
        // Product data
        title,
        description,
        thumbnail,
        images,
        // Variants data
        variants,
        seller_id: seller.id,
        shipping_profile_id: shippingProfileId,
        collection_id,
        category_ids
      }
    })

    res.status(201).json({
      success: true,
      product,
      seller_id: seller.id
    })

  } catch (error: any) {
    console.error("Error creando producto:", error)
    res.status(500).json({
      success: false,
      error: "Error al crear producto",
      message: error.message ?? String(error)
    })
  }
}