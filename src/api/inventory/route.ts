import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

type AdjustStockBody = {
  variantId: string
  quantity: number
}

type BatchAdjustStockBody = {
  items: Array<{
    variantId: string
    quantity: number
  }>
}

/**
 * GET /api/inventory
 * Devuelve todas las variantes con su inventario disponible
 * Formato simplificado para el frontend
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "product_id",
        "manage_inventory",
        "inventory_items.*",
        "inventory_items.inventory.*",
        "inventory_items.inventory.location_levels.*",
        "product.title",
        "product.handle",
      ],
    })

    const formatted = (variants || []).map((v: any) => {
      // Calcular cantidad total disponible
      let totalQuantity = 0
      const inventoryItems = v.inventory_items || []

      for (const invItem of inventoryItems) {
        const levels = invItem.inventory?.location_levels || []
        for (const level of levels) {
          totalQuantity += Number(level?.stocked_quantity || 0)
        }
      }

      return {
        variant_id: v.id,
        variant_title: v.title,
        sku: v.sku,
        product_id: v.product_id,
        product_title: v.product?.title,
        product_handle: v.product?.handle,
        manage_inventory: v.manage_inventory,
        available_quantity: totalQuantity,
        in_stock: totalQuantity > 0,
      }
    })

    return res.status(200).json({
      inventory: formatted,
      count: formatted.length,
    })
  } catch (err: any) {
    console.error("GET /api/inventory error:", err)
    return res.status(500).json({
      error: "Error obteniendo inventario",
      message: err?.message ?? String(err),
    })
  }
}

/**
 * POST /api/inventory
 * Ajustar inventario de una sola variante
 * Body: { variantId, quantity } -> quantity a descontar
 */
export async function POST(req: MedusaRequest<AdjustStockBody>, res: MedusaResponse) {
  try {
    const { variantId, quantity } = req.body || {}

    if (!variantId || typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({
        error: "Datos inválidos",
        message: "variantId y quantity (> 0) son requeridos",
      })
    }

    const query = req.scope.resolve("query")
    const inventoryService = req.scope.resolve(Modules.INVENTORY)

    // Obtener información de la variante
    const { data: [variant] } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "sku",
        "title",
        "manage_inventory",
        "inventory_items.*",
        "inventory_items.inventory.*",
        "inventory_items.inventory.location_levels.*",
      ],
      filters: { id: variantId },
    })

    if (!variant) {
      return res.status(404).json({ error: "Variante no encontrada" })
    }

    if (!variant.manage_inventory) {
      return res.status(200).json({
        success: true,
        message: "Variante no gestiona inventario",
        variant_id: variantId,
      })
    }

    const invItem = variant.inventory_items?.[0]
    const invItemId = invItem?.inventory?.id

    if (!invItemId) {
      return res.status(404).json({
        error: "No se encontró inventory_item",
        variant_id: variantId,
      })
    }

    // Obtener el location level (generalmente hay uno por defecto)
    const locationLevel = invItem.inventory?.location_levels?.[0]

    if (!locationLevel) {
      return res.status(404).json({
        error: "No se encontró location level",
        variant_id: variantId,
      })
    }

    const currentQty = Number(locationLevel.stocked_quantity || 0)
    const newQty = Math.max(0, currentQty - quantity)

    // Actualizar inventario
    await inventoryService.updateInventoryLevels([
      {
        inventory_item_id: invItemId,
        location_id: locationLevel.location_id,
        stocked_quantity: newQty,
      },
    ])

    return res.status(200).json({
      success: true,
      message: "Inventario actualizado",
      variant_id: variantId,
      previous_quantity: currentQty,
      adjusted_by: quantity,
      new_quantity: newQty,
    })
  } catch (err: any) {
    console.error("POST /api/inventory error:", err)
    return res.status(500).json({
      error: "Error ajustando inventario",
      message: err?.message ?? String(err),
    })
  }
}

/**
 * PUT /api/inventory/batch
 * Ajustar inventario de múltiples variantes (útil después de crear una orden)
 * Body: { items: [{ variantId, quantity }, ...] }
 */
export async function PUT(req: MedusaRequest<BatchAdjustStockBody>, res: MedusaResponse) {
  try {
    const { items } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Datos inválidos",
        message: "items debe ser un array con al menos un elemento",
      })
    }

    const query = req.scope.resolve("query")
    const inventoryService = req.scope.resolve(Modules.INVENTORY)

    const results = []
    const errors = []

    for (const item of items) {
      try {
        const { variantId, quantity } = item

        if (!variantId || typeof quantity !== "number" || quantity <= 0) {
          errors.push({
            variantId,
            error: "Datos inválidos para este item",
          })
          continue
        }

        // Obtener información de la variante
        const { data: [variant] } = await query.graph({
          entity: "product_variant",
          fields: [
            "id",
            "manage_inventory",
            "inventory_items.*",
            "inventory_items.inventory.*",
            "inventory_items.inventory.location_levels.*",
          ],
          filters: { id: variantId },
        })

        if (!variant) {
          errors.push({ variantId, error: "Variante no encontrada" })
          continue
        }

        if (!variant.manage_inventory) {
          results.push({
            variantId,
            status: "skipped",
            message: "No gestiona inventario",
          })
          continue
        }

        const invItem = variant.inventory_items?.[0]
        const invItemId = invItem?.inventory?.id
        const locationLevel = invItem?.inventory?.location_levels?.[0]

        if (!invItemId || !locationLevel) {
          errors.push({
            variantId,
            error: "No se encontró información de inventario",
          })
          continue
        }

        const currentQty = Number(locationLevel.stocked_quantity || 0)
        const newQty = Math.max(0, currentQty - quantity)

        await inventoryService.updateInventoryLevels([
          {
            inventory_item_id: invItemId,
            location_id: locationLevel.location_id,
            stocked_quantity: newQty,
          },
        ])

        results.push({
          variantId,
          status: "success",
          previous_quantity: currentQty,
          adjusted_by: quantity,
          new_quantity: newQty,
        })
      } catch (itemErr: any) {
        errors.push({
          variantId: item.variantId,
          error: itemErr?.message ?? "Error procesando item",
        })
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      processed: results.length,
      errors: errors.length,
      results,
      errors_detail: errors,
    })
  } catch (err: any) {
    console.error("PUT /api/inventory/batch error:", err)
    return res.status(500).json({
      error: "Error en ajuste por lotes",
      message: err?.message ?? String(err),
    })
  }
}