import PairData from "./PairData";

export type NotificationParams = [
    string,
    number,
    PairData,
    string | null
];
export interface PriceInfo {
    buy: number | null;
    sell: number | null;
    depthToSell: number | null;
    depthToBuy: number | null;
}

export type ParserType = 'mexc';
export const allowedParserTypes: ParserType[] = ['mexc'];

export interface ParserHandlerProps {
    type: ParserType;
}

export interface MarketState {
    marketPrice: number | null;
    updatedAt: number | null;
    buyPrice: number | null;
    sellPrice: number | null;
    zanoPrice: number | null;
    depthToSell: number | null;
    depthToBuy: number | null;
}