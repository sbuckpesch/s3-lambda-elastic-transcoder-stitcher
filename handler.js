'use strict';
const AWS = require('aws-sdk');
const util = require('util');
const path = require('path');

var pipelineId = '1527276506567-bso5vf';

// AWS elastic transcoder presets
var video_360 = '1455030365353-80u4mw'; //default HLS 360p
var video_480 = '1455033923052-lfe4h2'; // HLS 480p
//var video_480p_mp4 = 'custom transcoder preset';

// change these to match your S3 setup
// note: transcoder is picky about characters in the metadata
var region = 'eu-west-1';
var copyright = 'acme.com 2016';

// BEGIN Lambda code
console.log('Loading function');

const eltr = new aws.ElasticTranscoder({
    region: region
});
const s3 = new AWS.S3();

exports.stitchVideos = (event, context) => {

    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
    // Object key may have spaces or unicode non-ASCII characters.
    let srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    // Infer the image type.
    let typeMatch = srcKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
        console.error('unable to infer image type for key ' + srcKey);
        return;
    }
    let videoType = typeMatch[1];
    if (videoType !== "mp4") {
        console.log('skipping non-mp4 ' + srcKey);
        return;
    }

    // Prepare settings
    let dir = path.dirname(srcKey);
    let name = dir.split(path.sep).slice(-1).pop();
    let bucket = event.Records[0].s3.bucket.name;
    let key = event.Records[0].s3.object.key;
    let request = s3.getObject({Bucket: bucket, Key: key});

    const elasticTranscodeOptions = {
        filename: srcKey,
        bucket: event.Records[0].s3.bucket.name,
        output: '/tmp/',
        source: '/tmp/',
        name: name,
        path: name
    };
    console.log("Generating webfont:\n", util.inspect(elasticTranscodeOptions, {depth: 5}));

    // Validate webfont options
    if (!elasticTranscodeOptions.name) {
        console.log('No folder name specified ' + srcKey);
        return;
    }


    request.on('error', function (error, response) {
        console.log("Error getting object " + key + " from bucket " + bucket +
            ". Make sure they exist and your bucket is in the same region as this function.");
        console.log(error);
        console.log(error.stack);
        context.fail('Error', "Error getting file: " + error);
    });

    request.on('success', function(response) {
        let data = response.data;
        let manifest = data.Body.toString();

        console.log('Received data:', manifest);
        console.log('Received data:', data.ContentLength);

        manifest = JSON.parse(manifest);
        sendVideoToET(manifest, context);
    });

    request.send();

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
    let key =  manifest.media;
    let user = '';
    if ((manifest.user).length !== 0) {
        user = manifest.user + '/';
    }

    let generate_outputs = function(config) {
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

    job.on('error', function(error, response) {
        console.log('Failed to send new video ' + key + ' to ET');
        console.log(error);
        console.log(error.stack);

        context.fail(error);
    });

    job.on('success', function(response) {
        context.succeed('Completed, job to ET sent succesfully!');
    });
    job.send();
}