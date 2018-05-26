'use strict';
const AWS = require('aws-sdk');
const util = require('util');
const path = require('path');

// BEGIN Lambda code
console.log('Start stitchVideo function');

const transcoder = new AWS.ElasticTranscoder({
    region: 'eu-west-1'
});
const s3 = new AWS.S3();

module.exports.stitchVideos = async (event, context, callback) => {

    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

    // Prepare settings
    const filePath = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    const fileName = path.basename(filePath);
    const dir = path.dirname(filePath);
    const name = dir.split(path.sep).slice(-1).pop();
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    const elasticTranscodeOptions = {
        filePath,
        fileName,
        dir,
        bucket,
        name,
        objectKey: key,
        pipelineId: '1527276506567-bso5vf',
    };
    console.log("Elastic transcoder options:\n", util.inspect(elasticTranscodeOptions, {depth: 5}));

    // Validate input
    const typeMatch = filePath.match(/\.([^.]*)$/);
    if (!typeMatch) {
        console.error('unable to infer video type for key ' + filePath);
        return;
    }
    let videoType = typeMatch[1];
    if (videoType !== "mp4") {
        console.log('skipping non-mp4 ' + filePath);
        return;
    }
    if (!elasticTranscodeOptions.dir) {
        console.log('No folder name specified ' + dir);
        return;
    }
    if (elasticTranscodeOptions.fileName.includes('output')) {
        console.log('The file is already processed. Skip it ' + elasticTranscodeOptions.filePath);
        return;
    }
    if (name === 'intro.mp4' || name === 'outro.mp4') {
        console.log('Intro or outro uploaded. Skip processing: ' + filePath);
        return;
    }
    if (name === 'intro.mp4' || name === 'outro.mp4') {
        console.log('Intro or outro uploaded. Skip processing: ' + filePath);
        return;
    }

    const videoFormats = {
        mp4720p: '1351620000001-000010',
        webm720p: '1351620000001-100240',
    };

    // Prepare transcoding params
    let params = {
        PipelineId: elasticTranscodeOptions.pipelineId,
        Inputs: [{
            Key: elasticTranscodeOptions.filePath,
            FrameRate: 'auto',
            Resolution: 'auto',
            AspectRatio: 'auto',
            Interlaced: 'auto',
            Container: 'auto'
        }],
        Outputs: [
            {
                Key: elasticTranscodeOptions.filePath + '.output.720p.mp4',
                ThumbnailPattern: elasticTranscodeOptions.filePath + '-{count}',
                PresetId: videoFormats.mp4720p, //Generic 720p
            },
            {
                Key: elasticTranscodeOptions.filePath + '.output.720p.webm',
                ThumbnailPattern: '',
                PresetId: videoFormats.webm720p, //Webm 720p
            }
        ],
        UserMetadata: {
            date: new Date().toISOString(),
            copyright: 'App-Arena.com'
        }
    };

    // Check if intro.mp4 file is available in the folder
    let introAvailable = true;
    try {
        await s3.getObject({
            Bucket: elasticTranscodeOptions.bucket,
            Key: `${dir}/intro.mp4`
        }).promise();
    } catch (err) {
        introAvailable = false;
        console.log(`${dir}/intro.mp4 not available`);
    }
    if (introAvailable) {
        // Add intro to the beginning of the video
        console.log(`${dir}/intro.mp4 added to the beginning`);
        params.Inputs.unshift({
            Key: `${dir}/intro.mp4`,
            FrameRate: 'auto',
            Resolution: 'auto',
            AspectRatio: 'auto',
            Interlaced: 'auto',
            Container: 'auto'
        });
    }

    // Check if outro.mp4 file is available in the folder
    let outroAvailable = true;
    try {
        await s3.getObject({
            Bucket: elasticTranscodeOptions.bucket,
            Key: `${dir}/outro.mp4`
        }).promise();
    } catch (err) {
        outroAvailable = false;
        console.log(`${dir}/outro.mp4 not available`);
    }
    if (outroAvailable) {
        console.log(`${dir}/outro.mp4 added as outro`);
        // Add outro to the beginning of the video
        params.Inputs.push({
            Key: `${dir}/outro.mp4`,
            FrameRate: 'auto',
            Resolution: 'auto',
            AspectRatio: 'auto',
            Interlaced: 'auto',
            Container: 'auto'
        });
    }

    // Check if watermark.mp4 file is available in the folder
    let watermarkAvailable = true;
    try {
        await s3.getObject({
            Bucket: elasticTranscodeOptions.bucket,
            Key: `${dir}/watermark.png`
        }).promise();
    } catch (err) {
        watermarkAvailable = false;
        console.log(`${dir}/watermark.png not available`);
    }
    if (watermarkAvailable) {
        console.log(`${dir}/watermark.png added as watermark on the bottom right`);
        // Add watermark to all output
        let i;
        for (i = 0; i < params.Outputs.length; i++) {
            let output = params.Outputs[i];
            output.Watermarks = [{
                InputKey: `${dir}/watermark.png`,
                PresetWatermarkId: 'BottomRight'
            }];
            params.Outputs[i] = output;
        }
    }

    console.log("Job configuration:\n", util.inspect(params, {depth: 5}));
    transcoder.createJob(params, function (err, data) {
        if (err) {
            console.log('Something went wrong:', err)
        } else {
            console.log('Converting is done');
        }
        callback(err, data);
    });

}
;