import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/product"
import CustomProductsModule from "../modules/custom-products"

export default defineLink(
  ProductModule.linkable.product,
  CustomProductsModule.linkable.custom
)
