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

/**
*
* @param event
* @return {Promise<*>}
*/
module.exports.handler = async (event, context, callback) => {

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
	let videoType = typeMatch[1].toLowerCase();
	if (videoType !== "mp4" && videoType !== "mov") {
		console.log('skipping non-mp4/non-mov ' + filePath);
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
	if (name.toLowerCase() === 'intro.mp4' || name.toLowerCase() === 'outro.mp4') {
		console.log('Intro or outro uploaded. Skip processing: ' + filePath);
		return;
	}


	const videoFormats = {
		mp4720p: '1351620000001-000010'
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
		Outputs: [{
			Key: elasticTranscodeOptions.filePath + '.output.720p.mp4',
			ThumbnailPattern: elasticTranscodeOptions.filePath + '-{count}',
			PresetId: videoFormats.mp4720p, //Generic 720p
		}],
		UserMetadata: {
			date: new Date().toISOString(),
			copyright: 'App-Arena.com'
		}
	};

	// Check if intro.mp4 file is available in the folder
	let introAvailable = true;
	let introFilename = 'intro.mp4';
	try {
		await s3.getObject({
			Bucket: elasticTranscodeOptions.bucket,
			Key: `${dir}/${introFilename}`
		}).promise();
	} catch(err) {
		introAvailable = false;
		console.log(`${dir}/intro.mp4 not available`);
	}
	if (!introAvailable) {
		try {
			introFilename = 'intro.MP4';
			await s3.getObject({
				Bucket: elasticTranscodeOptions.bucket,
				Key: `${dir}/${introFilename}`
			}).promise();
			introAvailable = true;
		} catch(err) {
			console.log(`${dir}/intro.MP4 not available`);
		}
	}
	if (introAvailable) {
		// Add intro to the beginning of the video
		console.log(`${dir}/${introFilename} added to the beginning`);
		params.Inputs.unshift({
			Key: `${dir}/${introFilename}`,
			FrameRate: 'auto',
			Resolution: 'auto',
			AspectRatio: 'auto',
			Interlaced: 'auto',
			Container: 'auto'
		});
	}

	// Check if outro.mp4 file is available in the folder
	let outroAvailable = true;
	let outroFilename = 'outro.mp4';
	try {
		await s3.getObject({
			Bucket: elasticTranscodeOptions.bucket,
			Key: `${dir}/${outroFilename}`
		}).promise();
	} catch(err) {
		outroAvailable = false;
		console.log(`${dir}/outro.mp4 not available`);
	}
	if (!outroAvailable) {
		try {
			outroFilename = 'outro.MP4';
			await s3.getObject({
				Bucket: elasticTranscodeOptions.bucket,
				Key: `${dir}/${outroFilename}`
			}).promise();
			outroAvailable = true;
		} catch(err) {
			console.log(`${dir}/outro.MP4 not available`);
		}
	}
	if (outroAvailable) {
		console.log(`${dir}/${outroFilename} added as outro`);
		// Add outro to the beginning of the video
		params.Inputs.push({
			Key: `${dir}/${outroFilename}`,
			FrameRate: 'auto',
			Resolution: 'auto',
			AspectRatio: 'auto',
			Interlaced: 'auto',
			Container: 'auto'
		});
	}

	// Check if watermark.mp4 file is available in the folder
	let watermarkAvailable = true;
	let watermarkFilename = 'watermark.png';
	try {
		await s3.getObject({
			Bucket: elasticTranscodeOptions.bucket,
			Key: `${dir}/${watermarkFilename}`
		}).promise();
	} catch(err) {
		watermarkAvailable = false;
		console.log(`${dir}/watermark.png not available`);
	}
	if (!watermarkAvailable) {
		try {
			watermarkFilename = 'watermark.PNG';
			await s3.getObject({
				Bucket: elasticTranscodeOptions.bucket,
				Key: `${dir}/${watermarkFilename}`
			}).promise();
			watermarkAvailable = true;
		} catch(err) {
			console.log(`${dir}/watermark.PNG not available`);
		}
	}
	if (watermarkAvailable) {
		console.log(`${dir}/${watermarkFilename} added as watermark on the bottom right`);
		// Add watermark to all output
		let i;
		for (i = 0; i < params.Outputs.length; i++) {
			let output = params.Outputs[i];
			output.Watermarks = [{
				InputKey: `${dir}/${watermarkFilename}`,
				PresetWatermarkId: 'BottomRight'
			}];
			params.Outputs[i] = output;
		}
	}

	console.log("Job configuration:\n", util.inspect(params, {depth: 5}));
	try {
		const response = await transcoder.createJob(params).promise();
		console.log(response);
	} catch(err) {
		console.log(err, err.stack); // an error occurred
	}
}
;
