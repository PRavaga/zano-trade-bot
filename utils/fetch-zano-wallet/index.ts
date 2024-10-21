import * as env from "../../env-vars";

export const fetchData = async (method, params = {}) => {

    const httpBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "0",
        method,
        params,
    });

    return fetch(`http://localhost:${env.SIMPLEWALLET_PORT || 11211}/json_rpc`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: httpBody,
    });
}