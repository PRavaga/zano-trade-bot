import OfferType from "./OfferType";

export interface ConfigItem {
    pair_url: string;
    amount: string;
    price: string;
    type: string;
}

export type Config = ConfigItem[];

export interface ConfigItemParsed {
    pairId: number;
    amount: number;
    price: number;
    type: OfferType;
}

export type ConfigParsed = ConfigItemParsed[];