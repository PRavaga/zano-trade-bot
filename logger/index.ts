import * as env from '../env-vars';
import pino from "pino";

const logger = pino({
    level: env.DISABLE_INFO_LOGS ? "info" : "detailed-info",
    customLevels: {
        detailedInfo: 25,
    },
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true
        }
    }
});

export default logger;