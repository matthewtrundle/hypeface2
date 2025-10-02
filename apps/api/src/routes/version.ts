import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

export async function versionRoutes(app: FastifyInstance) {
  app.get('/version', async (req, reply) => {
    let gitCommit = 'unknown';
    let buildTime = new Date().toISOString();

    try {
      gitCommit = execSync('git rev-parse HEAD').toString().trim().substring(0, 8);
    } catch (e) {
      // Ignore git errors in production
    }

    return reply.send({
      version: '2.0.0',
      buildTime,
      gitCommit,
      features: {
        pyramidTrading: true,
        fixedLeverage: '3x',
        bidirectionalTrading: true,
        pyramidStyle: process.env.PYRAMID_STYLE || 'moderate',
        sellStrategy: '50%/100%',
        toFixedIssue: 'FIXED'
      },
      cacheTest: Math.random() // This will be different each deployment
    });
  });
}