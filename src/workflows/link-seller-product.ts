// src/workflows/link-seller-product.ts
import {
    createWorkflow,
    WorkflowResponse,
    createStep,
} from "@medusajs/framework/workflows-sdk"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"

/**
 * Input for linking a seller with a product.
 */
type LinkSellerProductInput = {
    seller_id: string
    product_id: string
}

/**
 * Workflow that safely creates a link between a seller and a product.
 * It first checks whether the link already exists to avoid the
 * "Cannot create multiple links" error.
 */
export const linkSellerProductWorkflow = createWorkflow(
    "link-seller-product",
    (input: LinkSellerProductInput) => {
        // Resolve the query service to inspect existing links
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        // 1️⃣ Check if the link already exists
        const existingLinks = query.graph({
            entity: "link",
            fields: ["id"],
            filters: {
                seller_id: input.seller_id,
                product_id: input.product_id,
            },
        })

        // 2️⃣ Create the link only when it does NOT exist
        const createLinkStep = createStep(
            "create-seller-product-link",
            async (_, { container }) => {
                const links = await existingLinks
                if (!links?.length) {
                    createRemoteLinkStep([
                        {
                            seller: { seller_id: input.seller_id },
                            [Modules.PRODUCT]: { product_id: input.product_id },
                        },
                    ])
                }
            }
        )

        // No explicit return needed, but we expose a response for consistency
        return new WorkflowResponse({ success: true })
    }
)
