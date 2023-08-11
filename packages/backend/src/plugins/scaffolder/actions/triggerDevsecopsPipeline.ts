import axios from 'axios';
import { loadBackendConfig, getRootLogger } from '@backstage/backend-common';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { assertError } from '@backstage/errors';
import {
  findPipelineRunByEventId,
  getPipelineRunStatus,
  PipelineRunStatus,
  PipelineRun,
} from '../helpers/kubernetes';

interface EventListenerResponse {
  eventListener: string;
  namespace: string;
  eventListenerUID: string;
  eventID: string;
}

let backendUrl = '';

(async function loadBackendUrl() {
  const config = await loadBackendConfig({
    argv: process.argv,
    logger: getRootLogger(),
  });

  backendUrl = config.getString('backend.baseUrl');
})();

async function waitForPipelinerunStart(eventID: string) {
  return new Promise((resolve, reject) => {
    let n = 0;

    // eslint-disable-next-line
    const intervalId = setInterval(async () => {
      const pipelinerun = (await findPipelineRunByEventId(
        eventID,
      )) as PipelineRun;

      if (pipelinerun) {
        clearInterval(intervalId);
        return resolve(pipelinerun);
      }

      // 10 sec
      if (++n === 10) {
        clearInterval(intervalId);
        return reject(`pipelinerun has not been created {eventID: ${eventID}}`);
      }
    }, 1000);
  }) as Promise<PipelineRun>;
}

async function waitForPipelinerunFinish(namespace: string, name: string) {
  return new Promise((resolve, reject) => {
    let n = 0;

    // eslint-disable-next-line
    const intervalId = setInterval(async () => {
      const pipelinerunStatus = (await getPipelineRunStatus(
        namespace,
        name,
      )) as PipelineRunStatus;
      const conditions = pipelinerunStatus.conditions;

      const successes = conditions.filter(condition => {
        return (
          condition.reason === 'Succeeded' || condition.reason === 'Completed'
        );
      });

      const fails = conditions.filter(condition => {
        return condition.status === 'False';
      });

      if (successes.length > 0) {
        clearInterval(intervalId);
        return resolve(pipelinerunStatus);
      }

      if (fails.length > 0) {
        clearInterval(intervalId);
        return reject(
          `pipelinerun failed with error. ${JSON.stringify(conditions)}`,
        );
      }

      // TODO: Not to wait in UI
      // 10 min
      if (++n === 120) {
        clearInterval(intervalId);
        return reject(
          `pipelinerun takes too long. {conditions: ${JSON.stringify(
            conditions,
          )}`,
        );
      }
    }, 5000);
  }) as Promise<PipelineRunStatus>;
}

export const triggerDevsecopsPipelineAction = () => {
  return createTemplateAction<{
    repoURL: string;
    developerName: string;
    targetEnv: 'AWS' | 'Azure';
    applicationName: string;
  }>({
    id: 'ibm:trigger-devsecops-pipeline',
    schema: {
      input: {
        required: ['repoURL', 'developerName', 'targetEnv', 'applicationName'],
        type: 'object',
        properties: {
          repoURL: {
            type: 'string',
            title: 'Target repo URL',
            description: 'The URL of the repo containing your Custom Resources',
          },
          developerName: {
            type: 'string',
            title: 'Developer Name',
            description: 'The developer name to associate resources with',
          },
          targetEnv: {
            type: 'string',
            enum: ['AWS', 'Azure', 'GCP', 'IBM Cloud'],
            title: 'Target Environment',
            description: 'The Cloud Environment to Deploy in',
          },
          applicationName: {
            type: 'string',
            title: 'Deployed Application Name',
            description: 'The name for the deployed application',
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          imageReference: {
            type: 'string',
            title: 'Image Reference',
            description: "Image registry url for the developer's app image",
          },
          imageDigest: {
            type: 'string',
            title: 'Image Digest',
            description: "Image digest (SHA) of the developer's app image",
          },
        },
      },
    },
    async handler(ctx) {
      try {
        ctx.logger.info(`Calling build pipeline`);
        let pipelineEndpoint = '';

        // TODO: update eventlistener name and its route
        if (process.env.NODE_ENV === 'development') {
          pipelineEndpoint = `http://ryu-test-backstage.${process.env.OPENSHIFT_BASE_DOMAIN}`;
        } else {
          pipelineEndpoint =
            'http://el-backstage-cr.tekton.svc.cluster.local:8080';
        }

        const data = {
          applicationName: ctx.input.applicationName,
          targetEnv: ctx.input.targetEnv,
          repoURL: ctx.input.repoURL,
          developerName: ctx.input.developerName,
        };

        // 1. Trigger through eventlistener
        // TODO: reuse if there is pipelinerun from same user/app
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

        // 2. Get pipelinerun resource
        const { eventID } = response.data as EventListenerResponse;
        const { metadata } = await waitForPipelinerunStart(eventID);
        ctx.logger.info(`PipelineRun (${metadata.name}) is in progress.`);

        // 3. Wait for pipelinerun
        const pipelinerunStatus = await waitForPipelinerunFinish(
          metadata.namespace,
          metadata.name,
        );

        if (pipelinerunStatus) {
          ctx.logger.info(`Pipeline has been completed`);
        }

        // 4. Extract the image reference and its sha
        //    Refer the pipeline tasks in `opt-gitops-services`
        const buildTask =
          pipelinerunStatus.taskRuns[`${metadata.name}-build-push-image`];

        if (!buildTask) {
          ctx.logger.error('Pipeline finished but could not fetch task info.');
          return;
        }

        const [imageReference, imageSha] = buildTask.status.taskResults?.map(
          result => {
            const value = result.value;
            return value.replace(/\n$/, '');
          },
        );

        if (!imageReference || !imageSha) {
          ctx.logger.error('Could not find Image Reference or Image Sha');
          return;
        }

        ctx.logger.info(`Tagged built image with SHA: ${imageSha}`);
        ctx.output('imageReference', imageReference);
        ctx.output('imageSha', imageSha);

        if (!backendUrl) {
          throw new Error('Backend URL has not been loaded. Try again.');
        }

        const rhacsResponse = await axios.post(
          `${backendUrl}/api/rhacs/v1/imagecontext`,
          {
            imageReference: imageReference,
            imageSha: imageSha,
          },
        );

        ctx.logger.info(`Pipeline result successfully saved.
            status: ${rhacsResponse.status}, 
            imageReference: ${rhacsResponse.data.imageReference}
            imageSha: ${rhacsResponse.data.imageSha}`);
      } catch (e) {
        assertError(e);

        ctx.logger.error(
          `Failed to run DevSecOps pipeline for deployment ${ctx.input.applicationName}: ${e.message}`,
        );
      }
    },
  });
};
