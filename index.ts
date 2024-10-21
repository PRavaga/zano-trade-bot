import socket from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";

(async () => {
    const res = await ZanoWallet.getWalletData();
    socket.emit("in-trading", { id: 1 });

    socket.on("new-order", async (data) => {
        console.log(data);
    });

    console.log("Bot started.");
})();

process.on('exit', () => {
    socket.emit("out-trading", { id: 1 }); 
});
