# Go Serverless

This is an exercise to expose open data via a JSON API using the [Serverless framework][serverless] and AWS platform services (Lambda, API Gateway, etc.).

The code is set up to parse [open data on income tax for Finnish companies](https://www.vero.fi/fi-FI/Avoin_data) in CSV format. The focus of the exercise is to implement query functions in node.js and deploy them as AWS Lambda functions available via the AWS API Gateway. The configuration and deployment is done using the [Serverless framework][serverless].

## Prerequisites

Here's what's needed to follow the exercise. You can either set these up on your
own Linux/Mac(/Windows?) or use the EC2 instance we'll provide access to.

- [Serverless framework][serverless]
- AWS account, IAM user with proper [permissions](http://docs.serverless.com/docs/configuring-aws) and [AWS CLI](http://docs.aws.amazon.com/cli/latest/userguide/installing.html)
  with the IAM user's credentials
- Clone of this Git repository
- A text editor

## Setting up the Serverless project and your deployment stage

In the directory where you cloned this repo, run [`serverless  project init`][serverless-init]. This will initialize the project with your own deployment stage (environment).
**When prompted for a stage name, use the one provided to you or at least try not to conflict with others.**

This creates an Elasticsearch domain in AWS which takes 10-15 minutes. You can continue with creating your API while this is happening. Come back here when this is done to upload your data.

More information on the development/deployment workflow with Serverless is in their [documentation][serverless-workflow].

### Upload data

First, after the project/stage setup has completed, deploy the data ingestion lambda function and S3 event which triggers it: `serverless dash deploy`.

Then upload the tax data to trigger ingestion to Elasticsearch: `aws s3 cp taxdata/taxdata2014.csv s3://test-tax-bucket-yourStageName`

## Creating your API

Think of an query you'd like to run against the tax data and implement it! Will it be simple and smooth like **querying companies by their business id or name** or would you like to see **companies paying more than a million euros in tax?**

### Write the Lambda function

### Configure API Gateway Endpoint

### Deployment

### Test

### Data schema

The data in Elasticsearch is in this format:

```
{
  "_index": "taxdata",
  "_type": "taxdata",
  "_id": "AVSdptvWVO_UrIOcK6x7",
  "_score": 7.429197,
  "_source": {
    "year": 2014,
    "businessId": "1031342-2",
    "name": "Turkistarha M. Saari Oy",
    "municipalityNumber": "005",
    "municipalityName": "Alajärvi",
    "taxableIncome": "2709.95",
    "taxDue": "539.77",
    "advanceTax": "1302.14",
    "taxRefund": "762.37",
    "residualTax": "0.00"
  }
}
```

### Example Elasticsearch queries

Use these as a starting point to implement your query.

Search by name:
```
curl -i -XGET 'yourESEndpointURL/taxdata/_search?q=name:*paja*&size=20'
```

Companies paying more than a million, highest first:
```
curl -XPOST "yourESEndpointURL" -d'
{
"size": 20,
"sort" : [{"taxDue" : {"order" : "desc"}}],
"query": {
   "range": {
     "taxDue": {
        "gte" : 1000000
     }
   }
 }
}'

```

## Data license

The open data used in this exercise is made available by the Finnish Tax Administration on their [website][verofi-avoin] under the [Creative Commons Attribution 4.0 International license][cc-by-40].

[serverless]: https://github.com/serverless/serverless
[serverless-workflow]: http://docs.serverless.com/docs/workflow
[serverless-init]: http://docs.serverless.com/docs/project-init
[verofi-avoin]: https://www.vero.fi/fi-FI/Avoin_data
[cc-by-40]: http://creativecommons.org/licenses/by/4.0/deed.en
