// src/workflows/link-seller-product.ts
import {
    createWorkflow,
    WorkflowResponse,
    createStep,
} from "@medusajs/framework/workflows-sdk"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

type LinkSellerProductInput = {
    seller_id: string
    product_id: string
}

const ensureSellerProductLinkStep = createStep(
    "ensure-seller-product-link-step",
    async (input: LinkSellerProductInput, { container }) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)

        // 1. Check if link exists
        const existingLinks = await remoteLink.list({
            seller: { seller_id: input.seller_id },
            [Modules.PRODUCT]: { product_id: input.product_id },
        })

        if (existingLinks.length > 0) {
            return { success: true }
        }

        // 2. Create link if it doesn't exist
        const links = await remoteLink.create([
            {
                seller: { seller_id: input.seller_id },
                [Modules.PRODUCT]: { product_id: input.product_id },
            },
        ])

        return { success: true, link: links[0] }
    }
)

export const linkSellerProductWorkflow = createWorkflow(
    "link-seller-product",
    (input: LinkSellerProductInput) => {
        ensureSellerProductLinkStep(input)
        return new WorkflowResponse({ success: true })
    }
)
