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

In the directory ```serverless-workshop/slss-workshop```, run [`slss  project init`][serverless-init]. This will initialize the project with your own deployment stage (environment).
**When prompted for a stage name, use the one provided to you or at least try not to conflict with others. Select the `eu-west-1` region when prompted.**

This creates an Elasticsearch domain in AWS which takes 10-15 minutes. You can continue with creating your API while this is happening. Come back here when this is done to upload your data.

More information on the development/deployment workflow with Serverless is in their [documentation][serverless-workflow].

Here is an overview diagram of how things will be set up:

![alt text][diagram]


### Upload data

First, after the project/stage setup has completed, the ingest lambda function requires
some dependencies to be installed. These can be installed by going into ```functions```
subdirectory inside the serverless project and running ```npm install```.

Then you can deploy the data ingestion lambda function and S3 event which triggers it: ```slss dash deploy```.

Then upload the tax data to trigger ingestion to Elasticsearch: ```aws s3 cp /tmp/verot_2014.csv s3://test-tax-bucket-yourStageName```

## Creating your API

Think of a query you'd like to run against the tax data and implement it! Will it be simple and smooth like **querying companies by their business id or name** or would you like to see **companies paying more than a million euros in tax?**

### Create the Lambda function skeleton

First you create a new function in your serverless project by calling ```slss function create functions/search```
Select *nodejs4.3* for runtime and *Create Endpoint* as the answer to the next question.
Your function is now ready to deploy. Your stage will be given a random domain name -
you can get the url to your search function like this:
```
echo https://$(aws apigateway get-rest-apis | jq -r .items[0].id).execute-api.eu-west-1.amazonaws.com/yourStageName/search
```

### Configure API Gateway Endpoint

You created an API Gateway endpoint skeleton using serverless. Now let's make it pass some data through to the Lambda function.

Create `slss-workshop/s-templates.json` which will contain a template of event data passed to your Lambda function. For example:

```
{
  "searchTemplate": {
    "application/json": {
      "body": "$input.json('$')",
      "pathParams" : "$input.params().path",
      "queryParams" : "$input.params().querystring",
      "name" : "$input.params('name')"
    }
  }
}
```

With the above template, the request body would be available as `event.body` and a GET parameter `name` would be available as `event.name` etc.

Refer to this template in your `slss-workshop/functions/search/s-function.json` file:

```
...
"requestTemplates": "$${searchTemplate}",
...
```

Also in the same file, fix the handler value like this:

```
"handler": "search/handler.handler",
```

This tells serverless to package the Lambda function so that everything in the `functions` directory is included rather than only
the specific directory for the function.

### Implement Elasticsearch query

First, you'll need some plumbing to be able to make requests to Elasticsearch. Make your Lambda hander look like this:

```
'use strict';

var lib = require('../lib');
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();

module.exports.handler = function(event, context, cb) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  process.env["SERVERLESS_REGION"] = process.env.AWS_DEFAULT_REGION;
  process.env["SERVERLESS_PROJECT_NAME"] = "slss-workshop";
  ServerlessHelpers.CF.loadVars()
  .then(function() {
    lib.esDomain['endpoint'] = process.env.SERVERLESS_CF_ESDomainEndpoint;

    //YOUR IMPLEMENTATION HERE

  })
  .catch(function(err) {
    return context.done(err, null);
  });
};

```

Then go ahead and implement your query! Take a look at `functions/lib/index.js` to see how ES index creation and data ingestion are implemented.

You'll need to pass a callback function which in turn calls the `cb` function passed to the handler when done: `cb(error, result)`. See [Lambda handler documentation][lambda-handler] for details.

### Deployment

When you're ready to test your function, run `slss dash deploy` and deploy it along with its API Gateway endpoint.

### Test

Make a request in a browser. You can see the endpoint URL in the deployment output.

### Reference material

#### Data schema

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

#### Example Elasticsearch queries

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
[lambda-handler]: http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
[aws-httpreq]: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/HttpRequest.html

[diagram]: http://plantuml.com/plantuml/png/RPBBReCm44Nt_eeH-sIJ7OgGqeVQI9NQAgsooMPYHc25sCYFK5JrtpiO4aBQ5JRtC7Fd3h8o8OVLTWFV0a2QOsqqQG-DiGT01ycM3ywZLqQ3qdpIaX9OBZjWxiYUo5RatDmQUN1P1fCgMAkYYMMumqwltjRmX9uQR9C9L-5nd-C8liJx3MCADnBtdUyjUbaopSgKfIiI7YjqNZdf2Aqifw1Rd47OBE0ko0FvHFm8bDvO23pV649fwfskqNebLOsQkR5EeNmPzf5zKlwPZvPgamZ13MRvB1icJE73gg8Wwo17ZnneGQwBLWm9H9PS2kkeHEgFjec3z9g87bdezf52PnHuKrtI9LdQQHw3xwq9_6mqv7HIaiJWz_8TnwafUhuKT8iKFklAO0uUlswwnSMcy1x8jbVosMaMjvN2Q_1rw5SdHFyp_9S6zAiH8lvr4-A1s49x9GoT-_U_ "Deployment diagram"
