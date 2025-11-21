import { MedusaService } from "@medusajs/framework/utils"
import { Custom } from "./models/custom"

class CustomProductsService extends MedusaService({ Custom }) {
  async getRecommendations(productId: string, type: string = "all") {
    const records = await this.listCustoms({ product_id: productId })
    if (records.length === 0) return []

    const record = records[0]
    let productIds: string[] = []

    if (type === "upsell" || type === "all") productIds.push(...((record.upsell_products as unknown as string[]) || []))
    if (type === "cross_sell" || type === "all") productIds.push(...((record.cross_sell_products as unknown as string[]) || []))
    if (type === "related" || type === "all") productIds.push(...((record.related_products as unknown as string[]) || []))

    productIds = [...new Set(productIds)].filter(pid => pid && pid !== productId)
    if (productIds.length === 0) return []

    // TODO: Implement remote query to fetch product details
    // For now, returning empty array as remoteQuery is not available in service context
    return []
  }
}

export default CustomProductsService
