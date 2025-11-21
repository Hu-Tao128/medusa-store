import { MedusaService } from "@medusajs/framework/utils"
import { Seller } from "./models/seller"

class SellerService extends MedusaService({
    Seller,
}) { }

export default SellerService
