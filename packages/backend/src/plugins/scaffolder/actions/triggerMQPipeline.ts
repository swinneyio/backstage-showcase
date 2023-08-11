import axios from 'axios';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { z } from 'zod';

export const triggerMQPipelineAction = () => {
  return createTemplateAction({
    id: 'ibm:call-mq-build-pipeline',
    description:
      'Custom action triggering pipeline to provision a MQ environment',
    schema: {
      input: z.object({
        clusterName: z
          .string()
          .describe('The name of the cluster to be created'),
        persistence: z
        .string()
        .describe('Whether to enable persistent storage'),
        highAvailability: z
          .string()
          .describe('Whether to deploy the MQ server in HA'),
      }) as z.ZodType,
    },

    async handler(ctx) {
      try {
        ctx.logger.info('Calling cluster deploy pipeline');

        const pipelineEndpoint =
          'http://mq-create-tekton.itzroks-666000qmn3-85z15f-6ccd7f378ae819553d37d5f2ee142bd6-0000.au-syd.containers.appdomain.cloud/';

        const data = {
          clusterName: ctx.input.clusterName,
          persistence: ctx.input.persistence,
          highAvailability: ctx.input.highAvailability,
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
        ctx.logger.error('Failed to run MQ server pipeline: ');
        ctx.logger.error(err.message);
      }
    },
  });
};