import {
    createWorkflow,
    WorkflowResponse,
    transform
} from "@medusajs/framework/workflows-sdk"
import {
    createProductsWorkflow
} from "@medusajs/medusa/core-flows"
import { Modules, ProductStatus } from "@medusajs/framework/utils" // Added ProductStatus
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"

type CreateSellerProductInput = {
    title: string
    description?: string
    price: number
    thumbnail?: string
    images?: string[]
    quantity?: number
    seller_id: string
}

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
                variants: [
                    {
                        title: "Default",
                        manage_inventory: Boolean(data.input.quantity && data.input.quantity > 0),
                        prices: [
                            {
                                amount: Math.round(data.input.price * 100),
                                currency_code: "mxn",
                            }
                        ]
                    }
                ]
            }
        ])

        const products = createProductsWorkflow.runAsStep({
            input: { products: productInput }
        })
        const product = transform({ products }, (data) => data.products[0])
        const variant = transform({ product }, (data) => data.product.variants[0])

        // 2. Link Product-Seller
        createRemoteLinkStep([
            {
                seller: { seller_id: input.seller_id },
                [Modules.PRODUCT]: { product_id: product.id },
            }
        ])

        // 5. Inventory (Optional)
        // Note: This is simplified. In a real app, we need to find a valid location_id first.
        // For now, we'll skip the complex inventory logic in the workflow to keep it simple 
        // or we would need a step to fetch the stock location.

        return new WorkflowResponse(product)
    }
)
