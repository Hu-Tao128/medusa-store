import { MedusaService } from "@medusajs/framework/utils"
import { Custom } from "./models/custom"

class CustomProductsService extends MedusaService({ Custom }) {
  async getRecommendations(productId: string, type: string = "all") {
    const records = await this.listCustoms({ product_id: productId })
    if (records.length === 0) return []

    const record = records[0]
    let productIds: string[] = []

    if (type === "upsell" || type === "all") productIds.push(...(record.upsell_products || []))
    if (type === "cross_sell" || type === "all") productIds.push(...(record.cross_sell_products || []))
    if (type === "related" || type === "all") productIds.push(...(record.related_products || []))

    productIds = [...new Set(productIds)].filter(pid => pid && pid !== productId)
    if (productIds.length === 0) return []

    const query = this.remoteQuery
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail"],
      filters: { id: productIds },
    })

    return data
  }
}

export default CustomProductsService
