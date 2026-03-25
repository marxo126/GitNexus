import { Worker } from 'bullmq';
const worker = new Worker('video-processing', async (job) => { console.log('Processing: ' + job.data.videoId); });
