import Decimal from "decimal.js";
import * as env from "../../env-vars";
import logger from "../../logger";
import { ConfigItemParsed } from "../../interfaces/common/Config";
import { MarketState, ParserHandlerProps, ParserType, PriceInfo } from "../../interfaces/common/Common";
import mexcParser, { MexcParser } from "./mexc";

export interface ParserConfig {
    fetchInterval: number;
    percentageSell: number;
    percentageBuy: number;
}

class ParserHandler {

    private parserType: ParserType;
    private targetParser: MexcParser;
    private lastPriceInfo: PriceInfo = {
        buy: null,
        sell: null
    }

    constructor(props: ParserHandlerProps) {
        this.parserType = props.type;
        if (this.parserType === 'mexc') {
            this.targetParser = mexcParser;
        }

        if (!this.targetParser) {
            throw new Error(`Parser not found for type: ${this.parserType}`);
        }
    }

    async init() {
        await this.targetParser.init();
    }

    getMarketState(): MarketState {
        return this.targetParser.getMarketState();
    }

    getConfigWithLivePrice(marketState: MarketState) {
        const preparedConfig = env.readConfig.map((item: ConfigItemParsed) => {
            const newPrice = item.type === "buy" ? marketState.buyPrice : marketState.sellPrice;

            const updatedAt = marketState.updatedAt || 0;

            if (updatedAt + (env.PRICE_INTERVAL_SEC * 1000 * 3) < +new Date()) {
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
        }).filter(e => !!e);

        return preparedConfig;
    }

    setPriceChangeListener(callback: (priceInfo: PriceInfo) => Promise<any>) {
	    // function supposed to be async, we shouldn't wait for this loop
        (async () => {
            while (true) {
                try {
                    const marketState = this.getMarketState();
    
                    if (!marketState.buyPrice || !marketState.sellPrice) {
                        throw new Error("Price is not available");
                    }
    
                    if (!this.lastPriceInfo.buy || !this.lastPriceInfo.sell) {
    
                        this.lastPriceInfo = {
                            buy: marketState.buyPrice,
                            sell: marketState.sellPrice
                        }
    
                        await callback(this.lastPriceInfo);
    
                        continue;
                    }
    
    
                    const buyPriceChangePercent = Math.abs((marketState.buyPrice - this.lastPriceInfo.buy) / this.lastPriceInfo.buy) * 100;
                    const sellPriceChangePercent = Math.abs((marketState.sellPrice - this.lastPriceInfo.sell) / this.lastPriceInfo.sell) * 100;
    
                    if (
                        buyPriceChangePercent > env.PRICE_CHANGE_SENSITIVITY_PERCENT ||
                        sellPriceChangePercent > env.PRICE_CHANGE_SENSITIVITY_PERCENT
                    ) {
                        logger.detailedInfo(`
                            Price change detected: 
                            buy ${buyPriceChangePercent.toFixed(2)}%, 
                            sell ${sellPriceChangePercent.toFixed(2)}%`
                        );
    
                        this.lastPriceInfo = {
                            buy: marketState.buyPrice,
                            sell: marketState.sellPrice
                        }
    
                        await callback(this.lastPriceInfo);
    
    
                    }
                } catch (error) {
                    logger.error(`Error updating config: ${error}`);
                } 
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        })();
    }
}

export default ParserHandler;