const ytdl = require('ytdl-core');
const yts = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);

async function searchYouTube(query) {
  const r = await yts(query);
  return (r && r.videos && r.videos.length) ? r.videos[0] : null;
}

async function downloadAudio(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const stream = ytdl(videoUrl, { filter: 'audioonly' });
    ffmpeg(stream)
      .audioBitrate(128)
      .save(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err));
  });
}

module.exports = { searchYouTube, downloadAudio };
