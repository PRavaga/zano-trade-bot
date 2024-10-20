import socket from "./socket-client";
import * as env from "./env-vars";

socket.emit("in-trading", { id: 1 });

process.on('exit', () => {
    socket.emit("out-trading", { id: 1 }); 
});

socket.on("new-order", async (data) => {
    console.log(data);
    env.AMOUNT;
});

console.log("Bot started.");