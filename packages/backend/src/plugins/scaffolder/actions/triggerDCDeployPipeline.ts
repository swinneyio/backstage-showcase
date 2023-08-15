import axios from 'axios';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { z } from 'zod';

export const triggerDCDeployPipelineAction = () => {
  return createTemplateAction({
    id: 'ibm:trigger-datacap-deploy-pipeline',
    description:
      'Custom action triggering pipeline to provision a DC application',
    schema: {
      input: z.object({
        cloud: z
          .string()
          .describe('Hyperscaler'),
        region: z
          .string()
          .describe('Region within Hyperscaler'),
        version: z.
        string().
        describe('Version of DC')
      }) as z.ZodType,
    },

    async handler(ctx) {
      try {
        ctx.logger.info('Calling DC deploy pipeline');

        // TODO: update endpoint
        const pipelineEndpoint =
          'http://datacap-create-tekton.apps.homelab.swinney.io';

        const data = {
          cloud: ctx.input.cloud,
          region: ctx.input.region,
          version: ctx.input.version
        };

        const response = await axios.post(
          pipelineEndpoint,
          JSON.stringify(data),
        );

        if (response.status === 202) {
          ctx.logger.info(`Pipeline build started successfully.`);
        } else {
          ctx.logger.info(
            `Pipeline build could not be triggered. Check if the tasks are being referenced properly`,
          );
        }
      } catch (err) {
        ctx.logger.error('Failed to run ACE Deploy pipeline: ');
        // ctx.logger.error(err.message);
      }
    },
  });
};
