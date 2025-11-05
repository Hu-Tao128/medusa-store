import { model } from "@medusajs/framework/utils"

export const Custom = model.define("custom", {
  id: model.id().primaryKey(),
  product_id: model.text().searchable(),

  // En lugar de usar array().of(), definimos como simple JSON o text
  related_products: model.json().nullable(),
  upsell_products: model.json().nullable(),
  cross_sell_products: model.json().nullable(),
})
