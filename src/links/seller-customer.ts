import { defineLink } from "@medusajs/framework/utils"
import SellerModule from "../modules/seller"
import CustomerModule from "@medusajs/customer"

export default defineLink(
    SellerModule.linkable.seller,
    CustomerModule.linkable.customer
)
