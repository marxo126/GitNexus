import { Queue } from 'bullmq';
const paymentQueue = new Queue('payments:high-priority');
export async function enqueuePayment(paymentId: string) { await paymentQueue.add('process', { paymentId }); }
