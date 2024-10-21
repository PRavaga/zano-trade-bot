import * as env from "../../env-vars";
import forge from "node-forge";

function createJWSToken(payload, secrete_str) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64').replace(/=/g, '');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '');

    const signature = forge.hmac.create();
    signature.start('sha256', secrete_str);
    signature.update(`${encodedHeader}.${encodedPayload}`);
    const encodedSignature = forge.util.encode64(signature.digest().getBytes()).replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function generateRandomString(length) {
    const bytes = forge.random.getBytesSync(Math.ceil(length / 2));
    const hexString = forge.util.bytesToHex(bytes);
    return hexString.substring(0, length);
}

function generateAccessToken(httpBody) {
    // Calculate the SHA-256 hash of the HTTP body
    const md = forge.md.sha256.create();
    md.update(httpBody);
    const bodyHash = md.digest().toHex();

    // Example payload
    const payload = {
        body_hash: bodyHash,
        user: 'zano_trade_app',
        salt: generateRandomString(64),
        exp: Math.floor(Date.now() / 1000) + (60), // Expires in 1 minute
    };

    return createJWSToken(payload, env.API_TOKEN);
}

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
            "Zano-Access-Token": generateAccessToken(httpBody),
        },
        body: httpBody,
    });
}