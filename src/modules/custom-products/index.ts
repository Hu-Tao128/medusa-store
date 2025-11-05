import { Module } from "@medusajs/framework/utils"
import CustomProductsService from "./service"
import { Custom } from "../../models/custom"

export const CUSTOM_PRODUCTS_MODULE = "customProducts"

export default Module(CUSTOM_PRODUCTS_MODULE, {
  service: CustomProductsService,
  models: [Custom],
  definition: {
    database: {
      schema: "custom_products",
    },
  },
})
