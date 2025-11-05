import { MedusaService } from "@medusajs/framework/utils"
import { Custom } from "../../models/custom"

class CustomProductsService extends MedusaService({ Custom }) {
  async getRecommendations(productId: string, type: string = "all") {
    try {
      // ✅ Usa el método del repositorio (ya inyectado por MedusaService)
      const customRecords = await this.list({
        product_id: productId,
      })

      if (customRecords.length === 0) return []

      const customRecord = customRecords[0]
      let productIds: string[] = []

      if (type === "upsell" || type === "all") {
        productIds.push(...(customRecord.upsell_products || []))
      }
      if (type === "cross_sell" || type === "all") {
        productIds.push(...(customRecord.cross_sell_products || []))
      }
      if (type === "related" || type === "all") {
        productIds.push(...(customRecord.related_products || []))
      }

      // Elimina duplicados y el propio id
      productIds = [...new Set(productIds)].filter(pid => pid && pid !== productId)

      if (productIds.length === 0) return []

      // ✅  Consulta remota solo si hay productos
      const query = this.remoteQuery_
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "thumbnail", "variants"],
        filters: { id: productIds },
        limit: 4,
      })

      return data

    } catch (error) {
      console.error("Error in getRecommendations:", error)
      return []
    }
  }
}

export default CustomProductsService
