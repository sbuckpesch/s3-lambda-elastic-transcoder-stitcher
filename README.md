# S3 video stitcher

1. Create a folder
2. Upload intro.mp4 and outro.mp4 into that folder
3. Drop a new video in mp4 format to that folder
4. Grab a cup of coffee
5. Refresh the folder and find your stitched output file


## Requirements

1. [Serverless framework >1.1.0](https://serverless.com/)

## Getting started

1. Clone this repository
2. Edit the serverless.yml file and enter a new and unique
   `bucket_name`, `region` and `stage`
3. `sls deploy`
4. [Make your bucket publicly available](https://havecamerawilltravel.com/photographer/how-allow-public-access-amazon-bucket/)
5. Create a folder on your s3 bucket and put some SVG files in it
6. Enjoy! :-)

## LICENSE

MIT

