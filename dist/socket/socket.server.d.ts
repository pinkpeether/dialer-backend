import { Server as HTTPServer } from 'http';
import { Server as SocketServer } from 'socket.io';
export declare const initSocket: (httpServer: HTTPServer) => SocketServer;
export declare const getIO: () => SocketServer;
export declare const emitToAgent: (agentId: number, event: string, data: unknown) => void;
export declare const emitToDashboard: (event: string, data: unknown) => void;
//# sourceMappingURL=socket.server.d.ts.map