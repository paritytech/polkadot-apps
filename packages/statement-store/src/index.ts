// Client
export { StatementStoreClient } from "./client.js";
export { ChannelStore } from "./channels.js";

// Topics
export {
    createTopic,
    createChannel,
    serializeTopicFilter,
    topicToHex,
    topicsEqual,
} from "./topics.js";

// Codec (advanced use — for consumers that need direct SCALE access)
export {
    encodeData,
    decodeData,
    encodeStatement,
    decodeStatement,
    createSignatureMaterial,
    toHex,
    fromHex,
} from "./codec.js";

// Transport (advanced use — for consumers that need custom transport implementations)
export { RpcTransport, createTransport } from "./transport.js";
export type { RpcClient } from "./transport.js";

// Errors
export {
    StatementStoreError,
    StatementEncodingError,
    StatementSubmitError,
    StatementSubscriptionError,
    StatementConnectionError,
    StatementDataTooLargeError,
} from "./errors.js";

// Types
export type {
    TopicHash,
    ChannelHash,
    StatementFields,
    DecodedStatement,
    TopicFilter,
    SerializedTopicFilter,
    StatementStoreConfig,
    PublishOptions,
    ReceivedStatement,
    StatementSigner,
    StatementSignerWithKey,
    SubmitStatus,
    StatementTransport,
    Unsubscribable,
    StatementEvent,
} from "./types.js";

// Constants
export {
    MAX_STATEMENT_SIZE,
    MAX_USER_TOTAL,
    DEFAULT_TTL_SECONDS,
    DEFAULT_POLL_INTERVAL_MS,
} from "./types.js";
