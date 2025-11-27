import {
    createWorkflow,
    WorkflowResponse,
    transform,
    createStep
} from "@medusajs/framework/workflows-sdk"
import {
    createProductsWorkflow
} from "@medusajs/medusa/core-flows"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils" // Added ProductStatus
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"

type CreateSellerProductInput = {
    title: string
    description?: string
    thumbnail?: string
    images?: string[]
    seller_id: string
    variants: {
        title: string
        price: number
        quantity?: number
    }[]
}

const createInventoryLevelsStep = createStep(
    "create-inventory-levels-step",
    async ({ product, inputVariants }: { product: any, inputVariants: any[] }, { container }) => {
        const inventoryService = container.resolve(Modules.INVENTORY)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        // 1. Get Default Stock Location
        const { data: stockLocations } = await query.graph({
            entity: "stock_location",
            fields: ["id"],
        })
        const locationId = stockLocations[0]?.id

        if (!locationId) return

        // 2. Fetch variants with inventory items to ensure we have the IDs
        const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: ["id", "title", "inventory_items.inventory_item_id"],
            filters: { product_id: product.id }
        })

        const levels: any[] = []

        variants.forEach((variant: any) => {
            const inputVariant = inputVariants.find((v) => v.title === variant.title)
            if (inputVariant && inputVariant.quantity > 0 && variant.inventory_items?.length) {
                levels.push({
                    inventory_item_id: variant.inventory_items[0].inventory_item_id,
                    location_id: locationId,
                    stocked_quantity: inputVariant.quantity,
                })
            }
        })

        if (levels.length) {
            await inventoryService.createInventoryLevels(levels)
        }
    }
)

export const createSellerProductWorkflow = createWorkflow(
    "create-seller-product",
    (input: CreateSellerProductInput) => {

        // 1. Create Product with Variant and Price
        const productInput = transform({ input }, (data) => [
            {
                title: data.input.title,
                description: data.input.description,
                status: "published" as ProductStatus,
                thumbnail: data.input.thumbnail,
                images: data.input.images?.map(url => ({ url })),
                options: [
                    {
                        title: "Variant",
                        values: data.input.variants.map(v => v.title)
                    }
                ],
                variants: data.input.variants.map(v => ({
                    title: v.title,
                    manage_inventory: Boolean(v.quantity && v.quantity > 0),
                    prices: [
                        {
                            amount: Math.round(v.price * 100),
                            currency_code: "mxn",
                        }
                    ],
                    options: {
                        "Variant": v.title
                    }
                }))
            }
        ])

        const products = createProductsWorkflow.runAsStep({
            input: { products: productInput }
        })
        const product = transform({ products }, (data) => data.products[0])
        const variant = transform({ product }, (data) => data.product.variants[0])

        // 2. Link Product-Seller
        // The linking is now handled by the separate 'link-seller-product' workflow
        // to avoid duplicate link errors and ensure idempotency.

        // 3. Create Inventory Levels
        createInventoryLevelsStep({
            product,
            inputVariants: input.variants
        })

        // 5. Inventory (Optional)
        // Note: This is simplified. In a real app, we need to find a valid location_id first.
        // For now, we'll skip the complex inventory logic in the workflow to keep it simple 
        // or we would need a step to fetch the stock location.

        return new WorkflowResponse(product)
    }
)
