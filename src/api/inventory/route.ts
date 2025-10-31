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

// Interfaces para los resultados
interface InventoryResult {
  variantId: string
  status: string
  message?: string
  previous_quantity?: number
  adjusted_by?: number
  new_quantity?: number
}

interface InventoryError {
  variantId: string
  error: string
}

/**
 * GET /api/inventory
 * Devuelve todas las variantes con su inventario disponible
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
 * Ajustar inventario de una sola variante O múltiples variantes
 * Body: { variantId, quantity } -> para un solo item
 * Body: { items: [{ variantId, quantity }, ...] } -> para múltiples items
 */
export async function POST(req: MedusaRequest<AdjustStockBody & BatchAdjustStockBody>, res: MedusaResponse) {
  try {
    const { variantId, quantity, items } = req.body || {}

    // Si viene el array "items", procesar batch
    if (Array.isArray(items) && items.length > 0) {
      console.log("🔄 Procesando batch de inventario con", items.length, "items")
      
      const query = req.scope.resolve("query")
      const inventoryService = req.scope.resolve(Modules.INVENTORY)

      const results: InventoryResult[] = []
      const errors: InventoryError[] = []

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
        message: `Procesados ${results.length} items, ${errors.length} errores`
      })
    }
    
    // Si viene variantId y quantity individual, procesar single item
    else if (variantId && typeof quantity === "number" && quantity > 0) {
      console.log("🔄 Procesando single item de inventario:", { variantId, quantity })

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
    } else {
      return res.status(400).json({
        error: "Datos inválidos",
        message: "Se requiere variantId y quantity para single item, o items array para batch",
      })
    }
  } catch (err: any) {
    console.error("POST /api/inventory error:", err)
    return res.status(500).json({
      error: "Error ajustando inventario",
      message: err?.message ?? String(err),
    })
  }
}