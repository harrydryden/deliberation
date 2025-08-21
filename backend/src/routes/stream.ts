import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';

const streamSchema = z.object({
  messageId: z.string().uuid(),
  deliberationId: z.string().uuid(),
  mode: z.enum(['chat', 'learn']).default('chat')
});

export async function streamRoutes(fastify: FastifyInstance) {
  // Proxy to Supabase Edge streaming function to keep keys server-side
  fastify.post('/agent', {
    preHandler: [fastify.authenticate],
    schema: { body: streamSchema },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof streamSchema> }>, reply: FastifyReply) => {
    try {
      const supabaseUrl = config.supabaseUrl;
      const supabaseAnonKey = config.supabaseAnonKey;

      if (!supabaseUrl || !supabaseAnonKey) {
        reply.status(500).send({ error: 'Streaming not configured' });
        return;
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/agent-orchestration-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(request.body),
      });

      if (!res.ok || !res.body) {
        reply.status(res.status).send({ error: res.statusText || 'Stream error' });
        return;
      }

      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');

      for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (err) {
      request.log.error({ err }, 'Stream proxy error');
      reply.status(500).send({ error: 'Stream proxy failed' });
    }
  });
}


