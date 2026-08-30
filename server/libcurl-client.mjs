/**
 * Reliability wrapper around Mercury's libcurl bare-mux transport.
 *
 * The upstream transport owns one HTTPSession and permanently fails when its
 * Wisp egress dies. Bardo keeps a pool of configured Wisp endpoints, rotates
 * without killing requests already using the old session, and falls back to
 * epoxy only after libcurl has exhausted the pool.
 */
import LibcurlClient from "./upstream.mjs";
import { createBardoLibcurlClient } from "./libcurl-pool.mjs";

export {
  RETRYABLE_CODES,
  PRE_SEND_CODES,
  canReplayRequest,
  createBardoLibcurlClient,
  isRetryableTransportError,
  libcurlErrorCode,
} from "./libcurl-pool.mjs";

export default createBardoLibcurlClient(LibcurlClient);
