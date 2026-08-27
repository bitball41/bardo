declare module "@mercuryworkshop/wisp-js/server" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export const server: {
    routeRequest(request: IncomingMessage, socket: Duplex, head: Buffer): void;
    options: {
      dns_result_order?: string;
      dns_method?: string;
      dns_servers?: string[];
      allow_private_ips?: boolean;
      allow_loopback_ips?: boolean;
    };
  };
}
