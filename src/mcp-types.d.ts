declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
  
  export class McpServer {
    constructor(options: any, capabilities: any);
    tool(name: string, description: string, params: any, handler: Function): void;
    connect(transport: Transport): Promise<void>;
    server: any;
  }
}

declare module '@modelcontextprotocol/sdk/server/sse.js' {
  import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
  
  export class SSEServerTransport implements Transport {
    constructor(path: string, res: any);
    onMessage: (callback: (message: any) => void) => void;
    send: (message: any) => void;
    handlePostMessage(req: any, res: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
  
  export class StdioServerTransport implements Transport {
    constructor();
    onMessage: (callback: (message: any) => void) => void;
    send: (message: any) => void;
  }
}

declare module '@modelcontextprotocol/sdk/shared/transport.js' {
  export interface Transport {
    onMessage: (callback: (message: any) => void) => void;
    send: (message: any) => void;
  }
} 