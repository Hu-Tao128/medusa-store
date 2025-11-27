import { createProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import SellerService from "../../../modules/seller/service"

function normalizePriceObject(price: any) {
  const original = typeof price?.amount === "number" ? price.amount : Number(price?.amount ?? 0)

  let amount_cents: number
  let amount_units: number

  if (Number.isInteger(original) && original > 1000) {
    // original viene en centavos
    amount_cents = original
    amount_units = +(original / 100).toFixed(2)
  } else {
    // original probablemente en unidades (p. ej. 250 o 250.5)
    amount_cents = Math.round(original * 100)
    amount_units = +(amount_cents / 100).toFixed(2)
  }

  return {
    ...price,
    amount_raw: original,      // valor original tal cual vino
    amount_cents,              // valor en centavos (entero)
    amount_units,              // valor en unidades con 2 decimales (float)
    amount: amount_cents,      // mantener `amount` como centavos para compatibilidad con el front
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")
  const id = (req.params && (req.params as any).id) || (req.query && (req.query as any).id)

  if (!id) {
    return res.status(400).json({ error: "Falta id del producto" })
  }

  try {
    const { data: [product] } = await query.graph({
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
        // incluir inventory_items y dentro el objeto inventory con location_levels
        "variants.inventory_items.*",
        "variants.inventory_items.inventory.*",
        "variants.inventory_items.inventory.location_levels.*",
        "categories.*",
      ],
      filters: {
        id,
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" })
    }

    // helper para extraer cantidad de un location_level o inventory item
    const qtyFromLevelValue = (lvl: any) =>
      Number(lvl?.stocked_quantity ?? lvl?.quantity ?? lvl?.available ?? lvl?.available_quantity ?? lvl?.qty ?? 0)

    const formatted = {
      ...product,
      variants: product.variants?.map((variant: any) => {
        // normalizar inventory_items -> calcular cantidades por inventory_item y total por variante
        const inventory_items = (variant.inventory_items || []).map((pv: any) => {
          const inv = pv.inventory || {}

          // location_levels puede venir dentro de inventory.location_levels o en pv.location_levels
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
        }
      })
    }

    res.json({ product: formatted })
  } catch (error: any) {
    console.error("Error fetching product by id:", error)
    res.status(500).json({
      error: "Error al obtener producto",
      message: error?.message ?? String(error)
    })
  }
}

type ProductVariantBody = {
  title: string
  price: number
  quantity?: number
}

type AddVariantsBody = {
  variants: ProductVariantBody[]
}

export async function POST(req: MedusaRequest<AddVariantsBody>, res: MedusaResponse) {
  const productId = req.params.id

  // 1️⃣ Auth Check
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" })
  }

  const token = authHeader.replace("Bearer ", "")
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT_SECRET not configured" })
  }

  let customer_id: string
  try {
    const decoded = jwt.verify(token, jwtSecret) as { customer_id: string }
    customer_id = decoded.customer_id
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" })
  }

  // 2️⃣ Seller Check
  const sellerModule = req.scope.resolve("seller") as SellerService
  const sellers = await sellerModule.listSellers({ user_id: customer_id })

  if (sellers.length === 0) {
    return res.status(403).json({ error: "You must be a registered seller to add variants" })
  }
  const seller = sellers[0]

  // 3️⃣ Product and Variant Validation
  const { variants } = req.body
  if (!variants || !variants.length) {
    return res.status(400).json({
      error: "Datos incompletos",
      message: "Se requiere al menos una variante para añadir."
    })
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as IProductModuleService

  try {
    // 4️⃣ Verify Product Ownership
    const product = await productModule.retrieveProduct(productId)

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" })
    }

    if (product.metadata?.seller_id !== seller.id) {
      return res.status(403).json({ error: "No tienes permiso para modificar este producto" })
    }

    // 5️⃣ Prepare and Create Variants
    const variantsToCreate = variants.map(v => ({
      product_id: productId,
      title: v.title,
      prices: [{
        amount: v.price,
        currency_code: "mxn"
      }]
    }))

    const { result: newVariants } = await createProductVariantsWorkflow(req.scope).run({
      input: {
        product_variants: variantsToCreate
      }
    })

    // Opcional: Refrescar el producto para devolverlo completo con las nuevas variantes
    const updatedProduct = await productModule.retrieveProduct(productId, {
      relations: ["variants", "variants.prices", "variants.inventory_items"]
    })

    res.status(201).json({
      success: true,
      message: `${newVariants.length} variante(s) añadida(s) correctamente.`,
      product: updatedProduct
    })

  } catch (error: any) {
    console.error(`Error añadiendo variantes al producto ${productId}:`, error)

    // Manejar errores específicos de Medusa
    if (error.type === 'not_found') {
      return res.status(404).json({ error: "Producto no encontrado" })
    }

    res.status(500).json({
      success: false,
      error: "Error al añadir variantes",
      message: error.message ?? String(error)
    })
  }
}