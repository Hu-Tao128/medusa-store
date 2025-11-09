import CustomProductsService from "./service"
import { Module } from "@medusajs/framework/utils"

export const CUSTOM_PRODUCTS_MODULE = "customProductsService"

export default Module(CUSTOM_PRODUCTS_MODULE, {
  service: CustomProductsService,
})
