import { Queue } from 'bullmq';
const videoQueue = new Queue('video-processing');
export async function enqueueVideo(videoId: string) { await videoQueue.add('transcode', { videoId }); }
