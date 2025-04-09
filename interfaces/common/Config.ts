import Decimal from "decimal.js";
import OfferType from "./OfferType";
import { MarketState } from "./Common";

export interface ConfigItem {
    pair_url: string;
    amount: string;
    price: string;
    type: string;
    trade_id?: string;
}

export type Config = ConfigItem[];

export interface ConfigItemParsed {
    pairId: number;
    amount: Decimal;
    price: Decimal;
    type: OfferType;
    trade_id: string | null;
    marketState?: MarketState;
}

export type ConfigParsed = ConfigItemParsed[];