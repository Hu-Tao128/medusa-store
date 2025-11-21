import { defineLink } from "@medusajs/framework/utils"
import SellerModule from "../modules/seller"
import ProductModule from "@medusajs/product"
import { Modules } from "@medusajs/framework/utils"

export default defineLink(
    SellerModule.linkable.seller,
    ProductModule.linkable.product
)
