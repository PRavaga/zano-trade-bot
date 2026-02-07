import Decimal from "decimal.js";
import * as env from "../../env-vars";
import logger from "../../logger";
import { ConfigItemParsed, ParserConfigPrepared } from "../../interfaces/common/Config";
import { MarketState, ParserHandlerProps, ParserType, PriceInfo } from "../../interfaces/common/Common";
import MexcParser from "./mexc";
import BitComParser from "./bit_com";

export interface ParserConfig {
    fetchInterval: number;
    percentageSell: number;
    percentageBuy: number;
    firstCurrency: string;
    secondCurrency: string;
    pairAgainstStablecoin: boolean;
}

class ParserHandler {

    private parserConfig: ParserConfigPrepared;
    private targetParser: MexcParser | BitComParser;
    private lastPriceInfo: PriceInfo = {
        buy: null,
        sell: null,
        depthToSell: null,
        depthToBuy: null,
    }

    constructor(props: ParserHandlerProps) {
        this.parserConfig = props.config;

        const parserParams = {
            fetchInterval: this.parserConfig.PRICE_INTERVAL_SEC,
            percentageSell: this.parserConfig.PRICE_SELL_PERCENT,
            percentageBuy: this.parserConfig.PRICE_BUY_PERCENT,
            firstCurrency: this.parserConfig.FIRST_CURRENCY,
            secondCurrency: this.parserConfig.SECOND_CURRENCY,
            pairAgainstStablecoin: this.parserConfig.PAIR_AGAINST_STABLECOIN,
        }

        if (this.parserConfig.PARSER_TYPE === 'mexc') {
            const mexcParser = new MexcParser(parserParams);
            this.targetParser = mexcParser;
        } else if (this.parserConfig.PARSER_TYPE === 'bitcom') {
            const bitComParser = new BitComParser(parserParams);

            this.targetParser = bitComParser;
        } else {
            throw new Error(`Parser not found for type: ${this.parserConfig.PARSER_TYPE}`);
        }

    }

    async init() {
        await this.targetParser.init();
    }

    getMarketState(): MarketState {
        return this.targetParser.getMarketState();
    }

    getConfigWithLivePrice(marketState: MarketState, item: ConfigItemParsed) {

        if (!item.parser_config) {
            throw new Error("Parser config is missing in getConfigWithLivePrice (unexpected).");
        }

        const newPrice = item.type === "buy" ? marketState.buyPrice : marketState.sellPrice;

        const updatedAt = marketState.updatedAt || 0;

        if (updatedAt + (item.parser_config.PRICE_INTERVAL_SEC * 1000 * 3) < +new Date()) {
            logger.error(`Price for pair ${item.pairId} is outdated. Skipping...`);
            return false;
        }

        if (!newPrice) {
            logger.error(`Price for pair ${item.pairId} is not available. Skipping...`);
            return false;
        }

        return {
            ...item,
            price: new Decimal(newPrice),
            marketState: this.getMarketState(),
        }
    }

    setPriceChangeListener(callback: (priceInfo: PriceInfo) => Promise<any>, configItem: ConfigItemParsed) {
        // function supposed to be async, we shouldn't wait for this loop

        (async () => {
            while (true) {
                try {
                    const marketState = this.getMarketState();

                    if (!marketState.buyPrice || !marketState.sellPrice || !marketState.depthToSell || !marketState.depthToBuy) {
                        throw new Error(`Price or depth is not available yet for pair ${configItem.pairId}.`);
                    }

                    if (
                        !this.lastPriceInfo.buy ||
                        !this.lastPriceInfo.sell ||
                        !this.lastPriceInfo.depthToSell ||
                        !this.lastPriceInfo.depthToBuy
                    ) {

                        this.lastPriceInfo = {
                            buy: marketState.buyPrice,
                            sell: marketState.sellPrice,
                            depthToSell: marketState.depthToSell,
                            depthToBuy: marketState.depthToBuy,
                        }

                        await callback(this.lastPriceInfo);

                        continue;
                    }

                    if (!configItem.parser_config) {
                        throw new Error("Parser config is missing in setPriceChangeListener (unexpected).");
                    }

                    const buyPriceChangePercent = Math.abs((marketState.buyPrice - this.lastPriceInfo.buy) / this.lastPriceInfo.buy) * 100;
                    const sellPriceChangePercent = Math.abs((marketState.sellPrice - this.lastPriceInfo.sell) / this.lastPriceInfo.sell) * 100;

                    const buyDepthChangePercent = Math.abs((marketState.depthToBuy - this.lastPriceInfo.depthToBuy) / this.lastPriceInfo.depthToBuy) * 100;
                    const sellDepthChangePercent = Math.abs((marketState.depthToSell - this.lastPriceInfo.depthToSell) / this.lastPriceInfo.depthToSell) * 100;

                    if (
                        buyPriceChangePercent > configItem.parser_config.PRICE_CHANGE_SENSITIVITY_PERCENT ||
                        sellPriceChangePercent > configItem.parser_config.PRICE_CHANGE_SENSITIVITY_PERCENT ||
                        buyDepthChangePercent > configItem.parser_config.DEPTH_CHANGE_SENSITIVITY_PERCENT ||
                        sellDepthChangePercent > configItem.parser_config.DEPTH_CHANGE_SENSITIVITY_PERCENT
                    ) {
                        logger.detailedInfo(`
                            Price or depth change detected: 
                            buy ${buyPriceChangePercent.toFixed(2)}%, 
                            sell ${sellPriceChangePercent.toFixed(2)}%
                            
                            depthToBuy ${buyDepthChangePercent.toFixed(2)}%,
                            depthToSell ${sellDepthChangePercent.toFixed(2)}%
                            PAIR: ${configItem.pairId}
                            `
                        );

                        this.lastPriceInfo = {
                            buy: marketState.buyPrice,
                            sell: marketState.sellPrice,
                            depthToSell: marketState.depthToSell,
                            depthToBuy: marketState.depthToBuy,
                        }

                        await callback(this.lastPriceInfo);


                    }
                } catch (error) {
                    logger.error(`Error updating config: ${error}`);
                    console.log(error);

                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        })();
    }
}

export default ParserHandler;