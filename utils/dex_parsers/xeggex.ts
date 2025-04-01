import * as env from "../../env-vars/index";
import { MarketState } from "../../interfaces/common/Common";
import logger from "../../logger";
import { ParserConfig } from "./parserHandler";

interface Order {
    type: 'buy' | 'sell';
    price: string;
    baseVolume: string;
    baseVolumeUSD: string;
}

class XeggexParser {

    private marketInfoUrl = 'https://api.xeggex.com/api/v2/market/info?id=674dd85c7017c14b13d8b92f&symbol=BANDIT/ZANO';
    private tradesUrl = 'https://api.xeggex.com/api/v2/orderbook?ticker_id=BANDIT%2FZANO&depth=100000';
    private config: ParserConfig;

    private marketState: MarketState = {
        marketPrice: null,
        updatedAt: null,
        buyPrice: null,
        sellPrice: null
    }

    constructor(config: ParserConfig) {
        this.config = config;
    }


    private async fetchMarketInfo() {
        try {
            const response = await fetch(this.marketInfoUrl);
            if (!response.ok) throw new Error(`Error fetching market info: ${response.statusText}`);
    
            const data = await response.json();
            this.marketState.marketPrice = parseFloat(data.lastPrice);
        } catch (error) {
            console.error('Error fetching market info:', error);
        }
    }
    

    private async fetchOrders(): Promise<void> {
        function calculateTargetPrice(orders: Order[], depthPercentage: number, type: 'buy' | 'sell'): number | null {
    
            const volumeCalcTarget = type === 'buy' ? 'baseVolumeUSD' : 'baseVolume';
    
            const totalVolume = orders.reduce((sum, order) => sum + parseFloat(order[volumeCalcTarget]), 0);
            const targetVolume = totalVolume * (depthPercentage / 100);
    
            let accumulatedVolume = 0;
            let targetPrice: number | null = null;
    
            for (const order of orders) {
                accumulatedVolume += parseFloat(order[volumeCalcTarget]);
                
                if (accumulatedVolume >= targetVolume) {
                    targetPrice = parseFloat(order.price);
                    break;
                }
            }
    
            return targetPrice;
        }
    
        try {
            const response = await fetch(this.tradesUrl);
            if (!response.ok) throw new Error(`Error fetching trade info: ${response.statusText}`);
    
            const trades = await response.json();
    
            const buyOrders = trades.bids.map(e => ({
                type: 'buy',
                price: e[0],
                baseVolume: e[1],
                baseVolumeUSD: e[1] * e[0]
            }))
            const sellOrders = trades.asks.map(e => ({
                type: 'sell',
                price: e[0],
                baseVolume: e[1],
                baseVolumeUSD: e[1] * e[0]
            }))
    
    
            this.marketState.buyPrice = calculateTargetPrice(buyOrders, this.config.depthPercentageBuy, 'buy');
            this.marketState.sellPrice = calculateTargetPrice(sellOrders, this.config.depthPercentageSell, 'sell');
        } catch (error) {
            console.error('Error calculating prices:', error);
        }
    }

    private async updateMarketData() {
        try {
            await this.fetchMarketInfo();
            await this.fetchOrders();
            this.marketState.updatedAt = +new Date();
            
        } catch (error) {
            console.error(error);
            console.log("ERROR WHILE FETCHING XEGGEX MARKET DATA");
        }
    }

    private async initService() {
        while (true) {
            await this.updateMarketData();
            await new Promise(resolve => setTimeout(resolve, this.config.fetchInterval * 1000));
        }
    }

    async init() {
        logger.detailedInfo("Xeggex parser is enabled. Initializing parser...");
        await this.updateMarketData();
        this.initService();
        logger.detailedInfo("Xeggex parser initialized.");
    }

    getMarketState() {
        return this.marketState;
    }
}

export {XeggexParser};

const xeggexParser = new XeggexParser({
    fetchInterval: env.PRICE_INTERVAL_SEC,
    depthPercentageSell: env.PRICE_SELL_DEPTH_PERCENT,
    depthPercentageBuy: env.PRICE_BUY_DEPTH_PERCENT
});


export default xeggexParser;