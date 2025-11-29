import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

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
    const { id } = req.params
    const query = req.scope.resolve("query")

    try {
        console.log(`🔍 Fetching products for seller: ${id}`)

        // Fetch all published products with rich relations
        // We filter in-memory to avoid remote-query metadata filter issues
        const { data: allProducts } = await query.graph({
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
                "variants.inventory_items.*",
                "variants.inventory_items.inventory.*",
                "variants.inventory_items.inventory.location_levels.*",
                "categories.*",
            ],
            filters: {
                status: ["published"],
            },
        })

        // Filter by seller_id in metadata
        const products = allProducts.filter((product: any) => {
            const sellerId = product.metadata?.seller_id || product.metadata?.seller
            return sellerId === id
        })

        console.log(`Found ${products.length} products for seller ${id} (out of ${allProducts.length} total published)`)

        // Helper for quantity
        const qtyFromLevelValue = (lvl: any) =>
            Number(lvl?.stocked_quantity ?? lvl?.quantity ?? lvl?.available ?? lvl?.available_quantity ?? lvl?.qty ?? 0)

        // Format products (logic copied from src/api/products/route.ts)
        const formattedProducts = products.map((product: any) => ({
            ...product,
            variants: product.variants?.map((variant: any) => {
                const inventory_items = (variant.inventory_items || []).map((pv: any) => {
                    const inv = pv.inventory || {}
                    const location_levels = inv.location_levels || pv.location_levels || []

                    const total_by_item = (location_levels || []).reduce((sum: number, lvl: any) => {
                        return sum + qtyFromLevelValue(lvl)
                    }, 0)

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
                    is_active: in_stock,
                    in_stock,
                }
            })
        }))

        res.json({
            products: formattedProducts,
            count: formattedProducts.length,
            store_id: id
        })

    } catch (error: any) {
        console.error("Error fetching store products:", error)
        res.status(500).json({
            error: "Error fetching store products",
            message: error.message ?? String(error)
        })
    }
}
