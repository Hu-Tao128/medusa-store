import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

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
        "categories.*",
      ],
      filters: {
        id,
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" })
    }

    const formatted = {
      ...product,
      variants: product.variants?.map((variant: any) => ({
        ...variant,
        price_set: {
          prices: (variant.price_set?.prices || variant.prices || []).map((p: any) =>
            normalizePriceObject(p)
          ),
        },
        prices: (variant.prices || []).map((p: any) => normalizePriceObject(p))
      }))
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