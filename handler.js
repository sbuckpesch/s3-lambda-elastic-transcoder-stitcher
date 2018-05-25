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

module.exports.stitchVideos = (event, context, callback) => {

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
    if (elasticTranscodeOptions.fileName.includes('output') ) {
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
    }

    // Video file input
    let videoInput = [{
        Key: elasticTranscodeOptions.filePath,
        FrameRate: 'auto',
        Resolution: 'auto',
        AspectRatio: 'auto',
        Interlaced: 'auto',
        Container: 'auto'
    }];

    // Video outputs
    const videoOutput = [{
        Key: elasticTranscodeOptions.filePath + '.output.720p.mp4',
        //ThumbnailPattern: elasticTranscodeOptions.filePath + '-{count}',
        PresetId: videoFormats.mp4720p, //Generic 720p
        Watermarks: [{
            InputKey: 'watermarks/logo.png',
            PresetWatermarkId: 'BottomRight'
        }],
    }, {
        Key: elasticTranscodeOptions.filePath + '.output.720p.webm',
        ThumbnailPattern: '',
        PresetId:  videoFormats.webm720p, //Webm 720p
        Watermarks: [{
            InputKey: 'watermarks/logo.png',
            PresetWatermarkId: 'BottomRight'
        }],
    }];

    // Check if intro.mp4 file is available in the folder
    console.log(`Check if  ${dir}/intro.mp4 is available in bucket ${elasticTranscodeOptions.bucket}`);
    s3.getObject({
        Bucket: elasticTranscodeOptions.bucket,
        Key: `${dir}/intro.mp4`
    }, function (err, data) {
        if (!err) {
            console.log(`${dir}/intro.mp4 added as intro`);
            // Add intro to the beginning of the video
            videoInput.unshift({
                Key: `${dir}/intro.mp4`,
                FrameRate: 'auto',
                Resolution: 'auto',
                AspectRatio: 'auto',
                Interlaced: 'auto',
                Container: 'auto'
            });
        }
    });

    // Check if outro.mp4 is available in the folder
    console.log("Video input:\n", util.inspect(videoInput, {depth: 5}));
    console.log("Video out:\n", util.inspect(videoOutput, {depth: 5}));

    transcoder.createJob({
        PipelineId: elasticTranscodeOptions.pipelineId,
        Inputs: videoInput,
        Outputs: videoOutput,
        UserMetadata: {
            date: new Date().toISOString(),
            copyright: 'App-Arena.com'
        }
    }, function (err, data) {
        if (err) {
            console.log('Something went wrong:', err)
        } else {
            console.log('Converting is done');
        }
        callback(err, data);
    });

    /*
        const response = {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Go Serverless v1.0! Your function executed successfully!',
                input: event,
            }),
        };

        callback(null, response);*/
};

/**
 * this function receive the request object informations
 * from S3 and try with Elastic Transcoder to
 * encode with a proper format the video uploaded
 */
function sendVideoToET(manifest, context) {
    let key = manifest.media;
    let user = '';
    if ((manifest.user).length !== 0) {
        user = manifest.user + '/';
    }

    let generate_outputs = function (config) {
        let out = [];
        for (let key in config) {
            let in_ = config[key];
            let out_ = {
                Key: in_.key ? in_.key : in_.preset,
                PresetId: in_.preset,
                Rotate: 'auto',
                Watermarks: [
                    {
                        InputKey: 'logo.png',
                        PresetWatermarkId: 'BottomRight'
                    }
                ]
            };

            if (in_.thumbnail) {
                out_.ThumbnailPattern = 'thumb/thumbnail' + '_{count}';
            }

            if (in_.segmentduration) {
                out_.SegmentDuration = in_.segmentduration;
            }

            out.push(out_);
        }

        return out;
    };

    let params = {
        PipelineId: pipelineId,
        OutputKeyPrefix: 'video/' + user + manifest.media + '/',
        Input: {
            Key: key
        },
        Outputs: generate_outputs([
            {
                preset: video_360,
                segmentduration: '60',
            }, {
                preset: video_480,
                thumbnail: true,
                segmentduration: '60',
            }/*,
            {
                key: 'video.mp4',
                preset: video_480p_mp4
            }*/
        ]),
        UserMetadata: {
            date: manifest.date.toString(),
            copyright: copyright
        },
        Playlists: [
            {
                Format: 'HLSv3',
                Name: 'playlist',
                OutputKeys: [
                    video_360,
                    video_480
                ]
            }
        ]
    };


    let job = eltr.createJob(params);

    job.on('error', function (error, response) {
        console.log('Failed to send new video ' + key + ' to ET');
        console.log(error);
        console.log(error.stack);

        context.fail(error);
    });

    job.on('success', function (response) {
        context.succeed('Completed, job to ET sent succesfully!');
    });
    job.send();
}