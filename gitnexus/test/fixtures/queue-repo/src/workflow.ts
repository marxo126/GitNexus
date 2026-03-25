import { proxyActivities } from '@temporalio/workflow';
const activities = proxyActivities({ startToCloseTimeout: '30s' });
export async function processOrderWorkflow(orderId: string) {
  const result = await activities.validateOrder(orderId);
  await activities.chargePayment(result.amount);
  await activities.sendConfirmation(orderId);
}
