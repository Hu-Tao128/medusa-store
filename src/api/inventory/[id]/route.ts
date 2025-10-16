import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /api/inventory/:id
 * id = product id
 * Devuelve el producto con sus variantes y cantidades por variante.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const id = (req.params && (req.params as any).id) || (req.query && (req.query as any).id)
    if (!id) {
      return res.status(400).json({ error: "Falta id (product id)" })
    }

    const query = req.scope.resolve("query")
    const { data: [product] } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "variants.*",
        "variants.inventory_items.*",
        "variants.inventory_items.inventory.*",
        "variants.inventory_items.inventory.location_levels.*"
      ],
      filters: { id }
    })

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" })
    }

    const qtyFromLevel = (lvl: any) =>
      Number(lvl?.stocked_quantity ?? lvl?.available_quantity ?? lvl?.available ?? lvl?.quantity ?? 0)

    const variants = (product.variants || []).map((v: any) => {
      const invItems = (v.inventory_items || []).map((pv: any) => {
        const levels = pv.inventory?.location_levels || pv.location_levels || []
        const total = (levels || []).reduce((s: number, l: any) => s + qtyFromLevel(l), 0) || Number(pv?.total_quantity ?? pv?.quantity ?? 0)
        return {
          inventory_item_id: pv?.inventory?.id ?? pv?.inventory_item_id,
          total_quantity: total,
          location_levels: levels,
        }
      })
      const total_variant = invItems.reduce((s: number, it: any) => s + Number(it.total_quantity || 0), 0)
      return {
        id: v.id,
        title: v.title,
        sku: v.sku,
        manage_inventory: v.manage_inventory,
        inventory_items: invItems,
        total_quantity: total_variant,
      }
    })

    return res.status(200).json({ product: { id: product.id, title: product.title }, variants, count: variants.length })
  } catch (err: any) {
    console.error("GET /api/inventory/:id error:", err)
    return res.status(500).json({ error: "Error interno", message: err?.message ?? String(err) })
  }
}