import axios from "axios";
import socket from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";
import { FetchUtils } from "./utils/fetch-methods";
import AuthParams from "./interfaces/fetch-utils/AuthParams";

(async () => {
    const res = await ZanoWallet.getWalletData();
    socket.emit("in-trading", { id: 1 });

    let tradeAuthToken: string; 

    if (!res.alias) {
        throw new Error("Zano App selected wallet does not have an alias. Select any wallet that has an alias.");
    }

    const authRes = await FetchUtils.auth(res as AuthParams);

    if (!authRes.success) {
        throw new Error(`Zano Trade origin auth responded with error: ${authRes.message}`);
    } else {
        tradeAuthToken = authRes.data;
    }

    console.log(tradeAuthToken);

    socket.on("new-order", async (data) => {
        console.log(data);
    });

    console.log("Bot started.");
})();

process.on('exit', () => {
    socket.emit("out-trading", { id: 1 }); 
});
