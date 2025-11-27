import { defineLink } from "@medusajs/framework/utils"

import { Modules } from "@medusajs/framework/utils"

export default defineLink(
    {
        serviceName: "seller",
        field: "seller",
        linkable: "seller_id",
        primaryKey: "id",
        entity: "Seller",
    },
    {
        serviceName: Modules.PRODUCT,
        field: "products",
        linkable: "product_id",
        primaryKey: "id",
        entity: "Product",
    }
)
