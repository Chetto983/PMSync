import { mistralChatHandler } from './mistral-chat.handler';
import { mistralEmbedHandler } from './mistral-embed.handler';

export const handlers = [mistralChatHandler, mistralEmbedHandler];
export { mistralChatHandler, mistralEmbedHandler };
