import http from 'http';
import * as k8s from '@kubernetes/client-node';

type KubernetesResponse = {
  response: http.IncomingMessage;
  body: any;
};

export type TaskResult = {
  name: string;
  type: string;
  value: string;
};

// ref: https://tekton.dev/docs/pipelines/pipelineruns/#pipelinerun-status
export interface PipelineRunStatus {
  conditions: Array<{
    message?: string;
    reason: string;
    status: 'Unknown' | 'True' | 'False';
    type: 'Started' | 'Running' | 'Succeeded' | 'Completed' | 'Completed';
  }>;
  startTime?: string;
  completionTime?: string;
  pipelineSpec: {
    tasks: Array<{
      name: string;
      status: {
        taskResults?: string[];
      };
    }>;
  };
  taskRuns: {
    [key: string]: {
      status: {
        taskResults: TaskResult[];
      };
    };
  };
}

export interface PipelineRun {
  metadata: {
    name: string;
    namespace: string;
  };
  status?: PipelineRunStatus;
}

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();

// const kubeCoreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
const kubeCRDApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);

function kubeErrorHandler(err: unknown) {
  console.log(err);
  if (err instanceof Error) {
    throw new Error(err.message);
  }
  throw new Error((err as KubernetesResponse).body.reason);
}

export async function findPipelineRunByEventId(eventId: string) {
  try {
    const { body } = (await kubeCRDApi.listClusterCustomObject(
      'tekton.dev',
      'v1beta1',
      'pipelineruns',
      undefined,
      undefined,
      undefined,
      undefined,
      `triggers.tekton.dev/triggers-eventid=${eventId}`,
    )) as { body: { items: PipelineRun[] } };

    if (body.items.length < 1) {
      return null;
    }

    return body.items[0];
  } catch (err) {
    return kubeErrorHandler(err);
  }
}

export async function getPipelineRunStatus(namespace: string, name: string) {
  try {
    const { body } = (await kubeCRDApi.getNamespacedCustomObject(
      'tekton.dev',
      'v1beta1',
      namespace,
      'pipelineruns',
      name,
    )) as { body: PipelineRun };

    return body.status;
  } catch (err) {
    return kubeErrorHandler(err);
  }
}
