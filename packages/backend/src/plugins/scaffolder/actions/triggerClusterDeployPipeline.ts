import axios from 'axios';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { z } from 'zod';

export const triggerClusterDeployPipelineAction = () => {
  return createTemplateAction({
    id: 'ibm:trigger-cluster-deploy-pipeline',
    description:
      'Custom action triggering pipeline to provision a new managed cluster',
    schema: {
      input: z.object({
        clusterName: z
          .string()
          .describe('The name of the cluster to be created'),
        clusterRegion: z.string().describe('Region the cluster resides within'),
        targetCloud: z
          .string()
          .describe('Public cloud provider to host the cluster'),
        ocpVersion: z.string().describe('OpenShift Version'),
        multiZone: z
          .boolean()
          .describe('Whether or not the cluster uses multiple zone'),
      }) as z.ZodType,
    },

    async handler(ctx) {
      try {
        ctx.logger.info('Calling cluster deploy pipeline');

        // TODO: update endpoint
        const pipelineEndpoint =
          'http://cluster-crud-tekton.itzroks-666000qmn3-85z15f-6ccd7f378ae819553d37d5f2ee142bd6-0000.au-syd.containers.appdomain.cloud/';

        const data = {
          clusterName: ctx.input.clusterName,
          region: ctx.input.clusterRegion,
          cloud: ctx.input.targetCloud,
          version: ctx.input.ocpVersion,
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
        ctx.logger.error('Failed to run Cluster Deploy pipeline: ');
        // ctx.logger.error(err.message);
      }
    },
  });
};
