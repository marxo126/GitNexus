import { Worker } from 'bullmq';
const worker = new Worker('payments:high-priority', async (job) => { console.log('Processing payment: ' + job.data.paymentId); });
