import OfferType from "../../interfaces/common/OfferType";
import Side from "../../interfaces/common/Side";

interface CreateOrderData {
    type: OfferType;
    side: Side;
    price: string;
    amount: string;
    pairId: number;
}

export default CreateOrderData;