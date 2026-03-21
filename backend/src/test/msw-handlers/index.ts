import { mistralChatHandler, openRouterChatHandler } from './mistral-chat.handler';
import { mistralEmbedHandler } from './mistral-embed.handler';

export const handlers = [mistralChatHandler, openRouterChatHandler, mistralEmbedHandler];
export { mistralChatHandler, openRouterChatHandler, mistralEmbedHandler };
