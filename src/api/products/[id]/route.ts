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