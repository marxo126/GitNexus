import { Client } from '@temporalio/client';
const client = new Client();
export async function startOrder(orderId: string) {
  await client.workflow.start(processOrderWorkflow, { taskQueue: 'orders', workflowId: 'order-' + orderId, args: [orderId] });
}
