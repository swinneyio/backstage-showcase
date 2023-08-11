import axios from 'axios';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { z } from 'zod';

export const triggerACEDeployPipelineAction = () => {
  return createTemplateAction({
    id: 'ibm:trigger-ace-deploy-pipeline',
    description:
      'Custom action triggering pipeline to provision an ACE application',
    schema: {
      input: z.object({
        clusterName: z
          .string()
          .describe('ACE application to be deployed here'),
        gitRepo: z
          .string()
          .describe('Repository housing ACE application'),
        barfile: z.
        string().
        describe('Name of BAR File')
      }) as z.ZodType,
    },

    async handler(ctx) {
      try {
        ctx.logger.info('Calling ACE deploy pipeline');

        // TODO: update endpoint
        const pipelineEndpoint =
          'http://ace-create-tekton.itzroks-666000qmn3-85z15f-6ccd7f378ae819553d37d5f2ee142bd6-0000.au-syd.containers.appdomain.cloud/';

        const data = {
          clusterName: ctx.input.clusterName,
          gitRepo: ctx.input.gitRepo,
          barfile: ctx.input.barfile
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
        ctx.logger.error(err.message);
      }
    },
  });
};
